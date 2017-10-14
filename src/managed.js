import Logger from 'septima-utils/logger';

const releaseName = '-septima-orm-release-func';
/** 
 * Substitutes properties of anObject with observable properties using Object.defineProperty()
 * @param target An object to be reorganized.
 * @param onChange a callback called on every change of properties.
 * @param onBeforeChange a callback called on before every change of properties.
 * @returns anObject by pass for convinence.
 */
function manageObject(target, onChange, onBeforeChange) {
    if (!target[releaseName]) {
        const container = {};
        for (let p in target) {
            container[p] = target[p];
            Object.defineProperty(target, (`${p}`), {
                enumerable: true,
                configurable: true,
                get: function () {
                    return container[p];
                },
                set: function (aValue) {
                    const _oldValue = container[p];
                    // Warning. Don't edit as !==
                    if (_oldValue != aValue) {
                        let _beforeState = null;
                        if (onBeforeChange)
                            _beforeState = onBeforeChange(target, {
                                source: target,
                                propertyName: p,
                                oldValue: _oldValue,
                                newValue: aValue
                            });
                        container[p] = aValue;
                        onChange(target, {
                            source: target,
                            propertyName: p,
                            oldValue: _oldValue,
                            newValue: aValue,
                            beforeState: _beforeState
                        });
                    }
                }
            });
        }
        Object.defineProperty(target, releaseName, {
            configurable: true,
            value: function () {
                delete target[releaseName];
                for (let p in target) {
                    const pValue = target[p];
                    delete target[p];
                    target[p] = pValue;
                }
            }
        });
    }
    return () => {
        target[releaseName]();
    };
}

function unmanageObject(anObject) {
    if (anObject[releaseName]) {
        anObject[releaseName]();
    }
}

function manageArray(target, spliced) {
    function pop() {
        const popped = Array.prototype.pop.call(target);
        if (popped) {
            spliced([], [popped]);
        }
        return popped;
    }

    function shift() {
        const shifted = Array.prototype.shift.call(target);
        if (shifted) {
            spliced([], [shifted]);
        }
        return shifted;
    }

    function push(...args) {
        const newLength = Array.prototype.push.apply(target, args);
        spliced(args, []);
        if (args.length > 0)
            target.cursor = args[args.length - 1];
        return newLength;
    }

    function unshift(...args) {
        const newLength = Array.prototype.unshift.apply(target, args);
        spliced(args, []);
        if (args.length > 0)
            target.cursor = args[args.length - 1];
        return newLength;
    }

    function reverse() {
        const reversed = Array.prototype.reverse.call(target);
        if (target.length > 0) {
            spliced([], []);
        }
        return reversed;
    }

    function sort(...args) {
        const sorted = Array.prototype.sort.apply(target, args);
        if (target.length > 0) {
            spliced([], []);
        }
        return sorted;
    }

    function splice(...args) {
        let beginDeleteAt = args[0];
        if (beginDeleteAt < 0)
            beginDeleteAt = target.length - beginDeleteAt;
        const deleted = Array.prototype.splice.apply(target, args);
        const added = [];
        for (let a = 2; a < args.length; a++) {
            const addedItem = args[a];
            added.push(addedItem);
        }
        spliced(added, deleted);
        return deleted;
    }
    Object.defineProperty(target, 'pop', {
        get: function () {
            return pop;
        }
    });
    Object.defineProperty(target, 'shift', {
        get: function () {
            return shift;
        }
    });
    Object.defineProperty(target, 'push', {
        get: function () {
            return push;
        }
    });
    Object.defineProperty(target, 'unshift', {
        get: function () {
            return unshift;
        }
    });
    Object.defineProperty(target, 'reverse', {
        get: function () {
            return reverse;
        }
    });
    Object.defineProperty(target, 'sort', {
        get: function () {
            return sort;
        }
    });
    Object.defineProperty(target, 'splice', {
        get: function () {
            return splice;
        }
    });
    return target;
}
const addListenerName = '-septima-listener-add-func';
const removeListenerName = '-septima-listener-remove-func';
const fireChangeName = '-septima-change-fire-func';

function listenable(target) {
    const listeners = new Set();
    Object.defineProperty(target, addListenerName, {
        enumerable: false,
        configurable: true,
        value: function (aListener) {
            listeners.add(aListener);
        }
    });
    Object.defineProperty(target, removeListenerName, {
        enumerable: false,
        configurable: true,
        value: function (listener) {
            listeners.delete(listener);
        }
    });
    Object.defineProperty(target, fireChangeName, {
        enumerable: false,
        configurable: true,
        value: function (change) {
            Object.freeze(change);
            Array.from(listeners)
                    .forEach(listener => {
                        listener(change);
                    });
        }
    });
    return () => {
        unlistenable(target);
    };
}

function unlistenable(target) {
    delete target[addListenerName];
    delete target[removeListenerName];
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
Object.defineProperty(module, 'unmanageObject', {
    enumerable: true,
    value: unmanageObject
});
Object.defineProperty(module, 'manageArray', {
    enumerable: true,
    value: manageArray
});
Object.defineProperty(module, 'fire', {
    enumerable: true,
    value: fire
});
Object.defineProperty(module, 'listenable', {
    enumerable: true,
    value: listenable
});
Object.defineProperty(module, 'unlistenable', {
    enumerable: true,
    value: unlistenable
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