import Invoke from 'septima-utils/invoke';
import Logger from 'septima-utils/logger';
import Requests from 'septima-remote/requests';
import readModelDocument from './model-reader';

const global = window;

const SERVER_ENTITY_TOUCHED_NAME = "Entity ";

const loadedEntities = new Map();

class Process {
    constructor(count, onSuccess, onFailure) {
        const reasons = [];
        function complete(e) {
            if (e) {
                reasons.push(e);
            }
            if (--count === 0) {
                if (reasons.length === 0) {
                    onSuccess();
                } else {
                    onFailure(reasons);
                }
            }
        }

        Object.defineProperty(this, 'onSuccess', {
            get: function () {
                return function () {
                    complete();
                };
            }
        });
        Object.defineProperty(this, 'onFailure', {
            get: function () {
                return function (e) {
                    complete(e);
                };
            }
        });
    }
}

function loadEntities(entitiesNames, onSuccess, onFailure) {
    if (entitiesNames.length > 0) {
        const process = new Process(entitiesNames.length, onSuccess, onFailure);
        entitiesNames.forEach(entityName => {
            Logger.info(`Loading ${SERVER_ENTITY_TOUCHED_NAME}${entityName} ...`);
            return Requests.requestEntity(entityName, entity => {
                loadedEntities.set(entityName, entity);
                process.onSuccess();
            }, reason => {
                Logger.severe(reason);
                process.onFailure(reason);
            });
        });
    } else {
        Invoke.later(onSuccess);
    }
}

function requireEntities(aEntitiesNames, aOnSuccess, aOnFailure) {
    let entitiesNames;
    if (!Array.isArray(aEntitiesNames)) {
        aEntitiesNames = `${aEntitiesNames}`;
        if (aEntitiesNames.length > 5 && aEntitiesNames.trim().substring(0, 5).toLowerCase() === "<?xml") {
            entitiesNames = [];
            const pattern = /queryId="(.+?)"/ig;
            let groups = pattern.exec(aEntitiesNames);
            while (groups) {
                if (groups.length > 1) {
                    entitiesNames.push(groups[1]);
                }
                groups = pattern.exec(aEntitiesNames);
            }
        } else {
            entitiesNames = [aEntitiesNames];
        }
    } else {
        entitiesNames = aEntitiesNames;
    }
    const toLoad = entitiesNames.filter(entityName => !loadedEntities.has(entityName));
    loadEntities(toLoad, () => {
        const resolved = [];
        for (let i = 0; i < entitiesNames.length; i++) {
            resolved.push(loadedEntities.get(entitiesNames[i]));
        }
        aOnSuccess.apply(null, resolved);
    }, aOnFailure);
}

function readModel(aModelContent, aTarget) {
    const doc = new DOMParser().parseFromString(aModelContent ? `${aModelContent}` : "", "text/xml");
    return readModelDocument(doc, null, aTarget);
}

function loadModel(aModuleName, aTarget) {
    Logger.warning("'loadModel' is deprecated. Use 'createModel' instead.");
    return createModel(aModuleName, aTarget);
}

function createModel(aModuleName, aTarget) {
    if (arguments.length > 0) {
        if (global.septimajs && global.septimajs.getModelDocument) {
            const modelDoc = global.septimajs.getModelDocument(aModuleName);
            if (modelDoc) {
                return readModelDocument(modelDoc, aModuleName, aTarget);
            } else {
                throw `Model definition for module "${aModuleName}" is not found`;
            }
        } else {
            throw "Fetched model definitions are not accessible. Use septima.js AMD loader and switch 'autofetch' configuration flag on or call 'createModel()' without arguments to create a model without fetched model definition.";
        }
    } else {
        return readModel('<?xml version="1.0" encoding="UTF-8"?><datamodel></datamodel>');
    }
}

const module = {};
Object.defineProperty(module, 'loadModel', {
    enumerable: true,
    value: loadModel
});
Object.defineProperty(module, 'createModel', {
    enumerable: true,
    value: createModel
});
Object.defineProperty(module, 'readModel', {
    enumerable: true,
    value: readModel
});
Object.defineProperty(module, 'requireEntities', {
    enumerable: true,
    value: requireEntities
});
export default module;