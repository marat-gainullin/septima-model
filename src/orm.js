/* global Promise */

import Invoke from 'septima-utils/invoke';
import Logger from 'septima-utils/logger';
import Requests from 'septima-remote/requests';
import readModelDocument from './model-reader';

const global = window;

const SERVER_ENTITY = 'Entity ';

const loadedEntities = new Map();

function loadEntities(entitiesNames, manager) {
    const entityRequests = [];
    if (manager) {
        manager.cancel = function () {
            entityRequests.forEach(entityRequest => {
                entityRequest.cancel();
            });
        };
    }
    return Promise.all(entitiesNames
            .map(entityName => {
                Logger.info(`Loading ${SERVER_ENTITY}${entityName} ...`);
                const entityRequest = {};
                entityRequests.push(entityRequest);
                return Requests.requestEntity(entityName, entityRequest)
                        .then(entity => {
                            Logger.info(`${SERVER_ENTITY}${entityName} ...Loaded`);
                            loadedEntities.set(entityName, entity);
                            return entity;
                        })
                        .catch(reason => {
                            Logger.severe(reason);
                            throw reason;
                        });
            }));
}

function requireEntities(entitiesNames, manager) {
    const _entitiesNames = !Array.isArray(entitiesNames) ? [entitiesNames] : entitiesNames;
    const toLoad = _entitiesNames.filter(entityName => !loadedEntities.has(entityName));
    return loadEntities(toLoad, manager)
            .then(() => {
                return _entitiesNames.map(entityName => loadedEntities.get(entityName));
            });
}

function readModel(content) {
    const doc = new DOMParser().parseFromString(content ? `${content}` : '', 'text/xml');
    return readModelDocument(doc, null);
}

const module = {};

Object.defineProperty(module, 'readModel', {
    enumerable: true,
    value: readModel
});
Object.defineProperty(module, 'requireEntities', {
    enumerable: true,
    value: requireEntities
});
export default module;