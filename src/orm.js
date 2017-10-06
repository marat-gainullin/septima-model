import Logger from 'core/logger';
import Requests from 'remote/requests';
import Utils from 'core/utils';
import readModelDocument from './model-reader';
import Invoke from 'core/invoke';
const global = window;

const SERVER_ENTITY_TOUCHED_NAME = "Entity ";

const loadedEntities = new Map();

function loadEntities(entitiesNames, onSuccess, onFailure) {
    if (entitiesNames.length > 0) {
        const process = new Utils.Process(entitiesNames.length, () => {
            onSuccess();
        }, aReasons => {
            onFailure(aReasons);
        });
        entitiesNames.forEach(entityName => {
            return Requests.requestEntity(entityName, entity => {
                loadedEntities.set(entityName, entity);
                process.onSuccess();
            }, reason => {
                Logger.severe(reason);
                process.onFailure(reason);
            });
            Logger.info(`Loading ${SERVER_ENTITY_TOUCHED_NAME}${entityName} ...`);
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