import Id from "septima-utils/id";
import Requests from "septima-remote/requests";
import M from "./managed";
import Orderer from "./orderer";

class QueryProxy {
    constructor(entityName) {
        this.entityName = entityName;
    }

    prepareCommand(parameters) {
        return {
            kind: 'command',
            entity: this.entityName,
            parameters: parameters
        };
    }

    requestData(parameters, manager) {
        return Requests.requestData(this.entityName, parameters, manager);
    }
}

class Entity {

    constructor(aModel, anEntityName, aKeysNames) {
        if (!aModel) throw "'aModel' ia required argument";
        if (!anEntityName) throw "'anEntityName' ia required argument";
        if (!aKeysNames) throw "'aKeyName(s)' ia required argument";

        this.model = aModel;
        this.queryProxy = new QueryProxy(anEntityName);
        this.keysNames = Array.isArray(aKeysNames) ? aKeysNames : [aKeysNames];
        this.orderers = {};
        this.scalars = {};
        this.collections = {};
        let keys = this.keysNames.sort();
        this.byKeys = new Orderer(keys);
        this.orderers[keys.join(' | ')] = this.byKeys;
    }

    get name() {
        return this.queryProxy.entityName;
    }

    findByKey(aKeyValues) {
        const keyValues = Array.isArray(aKeyValues) ? aKeyValues : [aKeyValues];
        if (keyValues.length === this.keysNames.length) {
            const criteria = {};
            for (let k = 0; k < this.keysNames.length; k++) {
                criteria[this.keysNames[k]] = keyValues[k];
            }
            const found = this.findBy(criteria);
            if (found.length === 0) {
                return null;
            } else if (found.length === 1) {
                return found[0];
            } else {
                throw `Found more than one item by key in entity '${self.name}'`;
            }
        } else {
            throw 'Keys names / values length mismatch detected';
        }
    }

    findBy(aCriteria) {
        let keys = Object.keys(aCriteria).sort();
        const ordererKey = keys.join(' | ');
        let orderer = this.orderers[ordererKey];
        if (!orderer) {
            orderer = new Orderer(keys);
            this.orderers[ordererKey] = orderer;
            this.byKeys.forEach(proxiedDatum => orderer.add(proxiedDatum));
        }
        return orderer.find(aCriteria);
    }

    wrapDatum(datum) {
        const self = this;
        const metProxy = self.findByKey(self.keysNames.map(keyName => datum[keyName]));
        if(metProxy){
            return metProxy;
        } else {
            const proxiedDatum = new Proxy(datum, M.manageObject({
                has: (target, key) => {
                    return self.scalars.hasOwnProperty(key) || self.collections.hasOwnProperty(key);
                },
                get: (target, key) => {
                    if (self.scalars.hasOwnProperty(key)) {
                        const scalarDefinition = self.scalars[key];
                        const scalarFields = Array.isArray(scalarDefinition.field) ? scalarDefinition.field : [scalarDefinition.field];
                        const primitives = scalarFields.map(scalarField => proxiedDatum[scalarField]);
                        if (scalarFields.length === scalarDefinition.target.keysNames.length) {
                            const scalar = scalarDefinition.target.findByKey(primitives);
                            if (primitives.some(v => v != null) && scalar == null) {
                                throw `Unresolved reference '${self.name}.${key} -> ${scalarDefinition.target.name}'; source: (${self.name}.${scalarFields}: ${primitives})`;
                            } else {
                                return scalar;
                            }
                        } else {
                            throw `keys / references length mismatch detected while scalar navigation: '${self.name}.${key}'`;
                        }
                    } else if (self.collections.hasOwnProperty(key)) {
                        const collection = self.collections[key];
                        const criteria = {};
                        const collectionSourceFields = Array.isArray(collection.field) ? collection.field : [collection.field];
                        if (collectionSourceFields.length === self.keysNames.length) {
                            for (let k = 0; k < collectionSourceFields.length; k++) {
                                criteria[collectionSourceFields[k]] = proxiedDatum[self.keysNames[k]];
                            }
                            return collection.source.findBy(criteria);
                        } else {
                            throw `keys / references length mismatch detected while collection navigation: '${self.name}.${key}'`;
                        }
                    }
                },
                set: (target, key, value) => {
                    const scalarDefinition = self.scalars[key];
                    const scalarFields = Array.isArray(scalarDefinition.field) ? scalarDefinition.field : [scalarDefinition.field];
                    if (scalarFields.length === scalarDefinition.target.keysNames.length) {
                        for (let k = 0; k < scalarFields.length; k++) {
                            proxiedDatum[scalarFields[k]] = value ? value[scalarDefinition.target.keysNames[k]] : null;
                        }
                        M.fire(proxiedDatum, {
                            source: proxiedDatum,
                            propertyName: key,
                            oldValue: value,
                            newValue: value
                        });
                    } else {
                        throw `keys / references length mismatch detected while scalar mutation: '${self.name}.${key}'`;
                    }
                }
            }));
            M.listen(proxiedDatum, {
                beforeChange: change => {
                    // Remove from one group
                    const orderer = self.orderers[change.propertyName];
                    if (orderer) {
                        orderer.remove(proxiedDatum);
                    }
                },
                change: change => {
                    const update = {kind: 'update', entity: self.queryProxy.entityName, keys: {}, data: {}};
                    // Tricky processing of primary keys modification case.
                    self.keysNames.forEach(keyName => update.keys[keyName] = keyName === change.propertyName ? change.oldValue : datum[keyName]);
                    update.data[change.propertyName] = change.newValue;
                    self.model.changeLog.push(update);
                    // And add to another group
                    const orderer = self.orderers[change.propertyName];
                    if (orderer) {
                        orderer.add(proxiedDatum);
                    }
                }
            });
            // add to groups
            Object.values(self.orderers).forEach(orderer => orderer.add(proxiedDatum));
            return proxiedDatum;
        }
    }

    wrapData(data) {
        const self = this;
        const proxiedData = new Proxy(data.map(datum => self.wrapDatum(datum)), M.manageArray());
        M.listen(proxiedData, {
            spliced: (added, deleted) => {
                added.forEach(aAdded => {
                    self.keysNames
                    // If a key is already assigned, than we have to preserve its value
                        .filter(keyName => !aAdded[keyName])
                        .forEach(keyName => aAdded[keyName] = Id.next());
                    const insertChange = {kind: 'insert', entity: self.queryProxy.entityName, data: {}};
                    for (let na in aAdded) {
                        insertChange.data[na] = aAdded[na];
                    }
                    self.model.changeLog.push(insertChange);
                });
                deleted.forEach(aDeleted => {
                    const deleteChange = {kind: 'delete', entity: self.queryProxy.entityName, keys: {}};
                    // changeLog keys for delete
                    self.keysNames
                        .forEach(keyName => deleteChange.keys[keyName] = aDeleted[keyName]);
                    self.model.changeLog.push(deleteChange);
                    // remove from groups
                    Object.values(self.orderers).forEach(orderer => orderer.remove(aDeleted));
                });
                return added.map(aAdded => {
                    return self.wrapDatum(aAdded);
                });
            }
        });
        return proxiedData;
    }

    query(parameters, manager) {
        if (!parameters) throw "'parameters' is required argument";
        const self = this;
        return this.queryProxy.requestData(parameters, manager)
            .then(data => self.wrapData(data));
    }

    enqueueUpdate(parameters) {
        this.model.changeLog.push(this.queryProxy.prepareCommand(parameters));
    }

    update(parameters, manager) {
        return Requests.requestCommit([this.queryProxy.prepareCommand(parameters)], manager);
    }
}

export default Entity;