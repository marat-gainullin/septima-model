const addListenerName = '-septima-listener-add-func';
const removeListenerName = '-septima-listener-remove-func';
const fireChangeName = '-septima-change-fire-func';

function manageObject(extraTraps) {
    const listeners = new Set();

    function fireBeforeChange(change) {
        Object.freeze(change);
        Array.from(listeners).forEach(listener => {
            if (listener.beforeChange) {
                listener.beforeChange(change);
            }
        });
    }

    function fireChange(change) {
        Object.freeze(change);
        Array.from(listeners).forEach(listener => {
            listener.change(change);
        });
    }

    return {
        get: (target, key) => {
            if (key === addListenerName) {
                return (aListener) => {
                    listeners.add(aListener);
                };
            } else if (key === removeListenerName) {
                return (aListener) => {
                    listeners.delete(aListener);
                };
            } else if (key === fireChangeName) {
                return fireChange;
            } else if (extraTraps && extraTraps.has(target, key)) {
                return extraTraps.get(target, key);
            } else {
                return target[key];
            }
        },
        set: (target, key, value) => {
            if (extraTraps && extraTraps.has(target, key)) {
                extraTraps.set(target, key, value);
            } else {
                const old = target[key];
                // Warning! Don't edit as !==
                if (old != value) {
                    const beforeState = fireBeforeChange({
                        source: target,
                        propertyName: key,
                        oldValue: old,
                        newValue: value
                    });
                    target[key] = value;
                    fireChange({
                        source: target,
                        propertyName: key,
                        oldValue: old,
                        newValue: value,
                        beforeState: beforeState
                    });
                }
            }
            return true;
        }
    };
}

function manageArray() {
    const listeners = new Set();

    function fireChange(change) {
        Object.freeze(change);
        Array.from(listeners).forEach(listener => {
            if (listener.change)
                listener.change(change);
        });
    }

    function fireSpliced(added, deleted) {
        Object.freeze(added);
        Object.freeze(deleted);
        const addedProcessed = [];
        Array.from(listeners).forEach(listener => {
            const processed = listener.spliced ? listener.spliced(added, deleted) : [];
            if (processed) {
                addedProcessed.push(...processed);
            }
        });
        return addedProcessed;
    }

    function scrollTo(target, value) {
        const old = target.cursor;
        if (old !== value) {
            target.cursor = value;
            fireChange({
                source: target,
                propertyName: 'cursor',
                oldValue: old,
                newValue: value
            });
        }
    }

    return {
        get: (target, key) => {
            function pop() {
                const popped = target.pop();
                if (popped) {
                    fireSpliced([], [popped]);
                }
                return popped;
            }

            function shift() {
                const shifted = target.shift();
                if (shifted) {
                    fireSpliced([], [shifted]);
                }
                return shifted;
            }

            function push(...args) {
                const newLength = Array.prototype.push.apply(target, args);
                const added = fireSpliced(args, []);
                if (added && added.length === args.length) {
                    for (let i = 0; i < added.length; i++) {
                        target[target.length - added.length + i] = added[i];
                    }
                }
                if (args.length > 0)
                    scrollTo(target, target[target.length - 1]);
                return newLength;
            }

            function unshift(...args) {
                const newLength = Array.prototype.unshift.apply(target, args);
                const added = fireSpliced(args, []);
                if (added && added.length === args.length) {
                    for (let i = 0; i < added.length; i++) {
                        target[i] = added[i];
                    }
                }
                if (args.length > 0) {
                    scrollTo(target, target[args.length - 1]);
                }
                return newLength;
            }

            function reverse() {
                const reversed = target.reverse();
                if (target.length > 0) {
                    fireSpliced([], []);
                }
                return reversed;
            }

            function sort(...args) {
                const sorted = Array.prototype.sort.apply(target, args);
                if (target.length > 0) {
                    fireSpliced([], []);
                }
                return sorted;
            }

            function splice(...args) {
                const deleted = Array.prototype.splice.apply(target, args);
                const added = [];
                for (let a = 2; a < args.length; a++) {
                    const addedItem = args[a];
                    added.push(addedItem);
                }
                const deleteFrom = Math.min(target.length - 1, Math.max(0, args[0]));
                const processedAdded = fireSpliced(added, deleted);
                if (processedAdded && processedAdded.length === added.length) {
                    for (let i = 0; i < processedAdded.length; i++) {
                        target[deleteFrom + i] = processedAdded[i];
                    }
                }
                if (added.length > 0) {
                    scrollTo(target, target[deleteFrom + added.length - 1]);
                }
                return deleted;
            }

            if (key === 'pop') {
                return pop;
            } else if (key === 'shift') {
                return shift;
            } else if (key === 'push') {
                return push;
            } else if (key === 'unshift') {
                return unshift;
            } else if (key === 'reverse') {
                return reverse;
            } else if (key === 'sort') {
                return sort;
            } else if (key === 'splice') {
                return splice;
            } else if (key === addListenerName) {
                return (aListener) => {
                    listeners.add(aListener);
                };
            } else if (key === removeListenerName) {
                return (aListener) => {
                    listeners.delete(aListener);
                };
            } else if (key === fireChangeName) {
                return fireChange;
            } else {
                return target[key];
            }
        },
        set: (target, key, value) => {
            if (target[key] !== value) {
                if (!isNaN(key)) {
                    const old = target[key];
                    target[key] = value;
                    fireSpliced([value], [old]);
                } else {
                    const old = target[key];
                    target[key] = value;
                    fireChange({
                        source: target,
                        propertyName: key,
                        oldValue: old,
                        newValue: value
                    });
                }
            }
            return true;
        }
    };
}

function listen(target, listener) {
    const addListener = target[addListenerName];
    if (addListener) {
        addListener(listener);
        return () => {
            target[removeListenerName](listener);
        };
    } else {
        return null;
    }
}

function unlisten(target, aListener) {
    const removeListener = target[removeListenerName];
    if (removeListener)
        removeListener(aListener);
}

function fire(target, change) {
    target[fireChangeName](change);
}

const module = {};

Object.defineProperty(module, 'manageObject', {
    enumerable: true,
    value: manageObject
});
Object.defineProperty(module, 'manageArray', {
    enumerable: true,
    value: manageArray
});
Object.defineProperty(module, 'fire', {
    enumerable: true,
    value: fire
});
Object.defineProperty(module, 'listen', {
    enumerable: true,
    value: listen
});
Object.defineProperty(module, 'unlisten', {
    enumerable: true,
    value: unlisten
});

export default module;