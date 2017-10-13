/* global Promise */

import Invoke from 'septima-utils/invoke';
import Logger from 'septima-utils/logger';
import Requests from 'septima-remote/requests';
import readModelDocument from './model-reader';

const global = window;

const SERVER_ENTITY_TOUCHED_NAME = 'Entity ';

const loadedEntities = new Map();

function loadEntities(entitiesNames) {
    return Promise.all(entitiesNames.map(entityName => {
        Logger.info(`Loading ${SERVER_ENTITY_TOUCHED_NAME}${entityName} ...`);
        return Requests.requestEntity(entityName)
                .then(entity => {
                    loadedEntities.set(entityName, entity);
                })
                .catch(reason => {
                    Logger.severe(reason);
                    throw reason;
                });
    }));
}

function requireEntities(aEntitiesNames) {
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
    return loadEntities(toLoad).then(() => {
        const resolved = [];
        for (let i = 0; i < entitiesNames.length; i++) {
            resolved.push(loadedEntities.get(entitiesNames[i]));
        }
        return resolved;
    });
}

function readModel(content) {
    const doc = new DOMParser().parseFromString(content ? `${content}` : '', 'text/xml');
    return readModelDocument(doc, null);
}

function loadModel(resourceName) {
    Logger.warning("'loadModel' is deprecated. Use 'createModel' instead.");
    return createModel(resourceName);
}

function createModel(resourceName) {
    if (arguments.length > 0) {
        if (global.septimajs && global.septimajs.getModelDocument) {
            const modelDoc = global.septimajs.getModelDocument(resourceName);
            if (modelDoc) {
                return readModelDocument(modelDoc, resourceName);
            } else {
                throw `Model definition for resource "${resourceName}" is not found`;
            }
        } else {
            throw "Fetched model definitions are not accessible. Use septima.js 'autofetch' configuration flag or call 'createModel()' without arguments to create a fresh model.";
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