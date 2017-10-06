import Logger from 'core/logger';
const releaseName = '-septima-orm-release-func';
/** 
 * Substitutes properties of anObject with observable properties using Object.defineProperty()
 * @param anObject An object to be reorganized.
 * @param aOnChange a callback called on every change of properties.
 * @param aOnBeforeChange a callback called on before every change of properties.
 * @returns anObject by pass for convinence.
 */
function manageObject(anObject, aOnChange, aOnBeforeChange) {
    if (!anObject[releaseName]) {
        const container = {};
        for (const p in anObject) {
            container[p] = anObject[p];
            ((() => {
                const _p = p;
                Object.defineProperty(anObject, (`${_p}`), {
                    enumerable: true,
                    configurable: true,
                    get: function() {
                        return container[_p];
                    },
                    set: function(aValue) {
                        const _oldValue = container[_p];
                        if (_oldValue != aValue) {
                            let _beforeState = null;
                            if (aOnBeforeChange)
                                _beforeState = aOnBeforeChange(anObject, {
                                    source: anObject,
                                    propertyName: _p,
                                    oldValue: _oldValue,
                                    newValue: aValue
                                });
                            container[_p] = aValue;
                            aOnChange(anObject, {
                                source: anObject,
                                propertyName: _p,
                                oldValue: _oldValue,
                                newValue: aValue,
                                beforeState: _beforeState
                            });
                        }
                    }
                });
            }))();
        }
        Object.defineProperty(anObject, releaseName, {
            configurable: true,
            value: function() {
                delete anObject[releaseName];
                for (const p in anObject) {
                    const pValue = anObject[p];
                    delete anObject[p];
                    anObject[p] = pValue;
                }
            }
        });
    }
    return {
        release: function() {
            anObject[releaseName]();
        }
    };
}

function unmanageObject(anObject) {
    if (anObject[releaseName]) {
        anObject[releaseName]();
    }
}

function manageArray(aTarget, aOnChange) {
    function pop() {
        const popped = Array.prototype.pop.call(aTarget);
        if (popped) {
            aOnChange.spliced([], [popped]);
        }
        return popped;
    }

    function shift() {
        const shifted = Array.prototype.shift.call(aTarget);
        if (shifted) {
            aOnChange.spliced([], [shifted]);
        }
        return shifted;
    }

    function push() {
        const newLength = Array.prototype.push.apply(aTarget, arguments);
        const added = [];
        for (let a = 0; a < arguments.length; a++) {
            added.push(arguments[a]);
        }
        aOnChange.spliced(added, []);
        if (added.length > 0)
            aTarget.cursor = added[added.length - 1];
        return newLength;
    }

    function unshift() {
        const newLength = Array.prototype.unshift.apply(aTarget, arguments);
        const added = [];
        for (let a = 0; a < arguments.length; a++) {
            added.push(arguments[a]);
        }
        aOnChange.spliced(added, []);
        if (added.length > 0)
            aTarget.cursor = added[added.length - 1];
        return newLength;
    }

    function reverse() {
        const reversed = Array.prototype.reverse.apply(aTarget);
        if (aTarget.length > 0) {
            aOnChange.spliced([], []);
        }
        return reversed;
    }

    function sort() {
        const sorted = Array.prototype.sort.apply(aTarget, arguments);
        if (aTarget.length > 0) {
            aOnChange.spliced([], []);
        }
        return sorted;
    }

    function splice() {
        let beginDeleteAt = arguments[0];
        if (beginDeleteAt < 0)
            beginDeleteAt = aTarget.length - beginDeleteAt;
        const deleted = Array.prototype.splice.apply(aTarget, arguments);
        const added = [];
        for (let a = 2; a < arguments.length; a++) {
            const aAdded = arguments[a];
            added.push(aAdded);
        }
        aOnChange.spliced(added, deleted);
        return deleted;
    }
    Object.defineProperty(aTarget, "pop", {
        get: function() {
            return pop;
        }
    });
    Object.defineProperty(aTarget, "shift", {
        get: function() {
            return shift;
        }
    });
    Object.defineProperty(aTarget, "push", {
        get: function() {
            return push;
        }
    });
    Object.defineProperty(aTarget, "unshift", {
        get: function() {
            return unshift;
        }
    });
    Object.defineProperty(aTarget, "reverse", {
        get: function() {
            return reverse;
        }
    });
    Object.defineProperty(aTarget, "sort", {
        get: function() {
            return sort;
        }
    });
    Object.defineProperty(aTarget, "splice", {
        get: function() {
            return splice;
        }
    });
    return aTarget;
}

const addListenerName = "-septima-listener-add-func";
const removeListenerName = "-septima-listener-remove-func";
const fireChangeName = "-septima-change-fire-func";

function listenable(aTarget) {
    const listeners = new Set();
    Object.defineProperty(aTarget, addListenerName, {
        value: function(aListener) {
            listeners.add(aListener);
        }
    });
    Object.defineProperty(aTarget, removeListenerName, {
        value: function(aListener) {
            listeners.delete(aListener);
        }
    });
    Object.defineProperty(aTarget, fireChangeName, {
        value: function(aChange) {
            Object.freeze(aChange);
            const _listeners = [];
            listeners.forEach(aListener => {
                _listeners.push(aListener);
            });
            _listeners.forEach(aListener => {
                aListener(aChange);
            });
        }
    });
    return () => {
        unlistenable(aTarget);
    };
}

function unlistenable(aTarget) {
    delete aTarget[addListenerName];
    delete aTarget[removeListenerName];
}

function listen(aTarget, aListener) {
    const addListener = aTarget[addListenerName];
    if (addListener) {
        addListener(aListener);
        return () => {
            aTarget[removeListenerName](aListener);
        };
    } else {
        return null;
    }
}

function unlisten(aTarget, aListener) {
    const removeListener = aTarget[removeListenerName];
    if (removeListener)
        removeListener(aListener);
}

function fire(aTarget, aChange) {
    try {
        aTarget[fireChangeName](aChange);
    } catch (e) {
        Logger.severe(e);
    }
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