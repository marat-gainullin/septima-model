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

    constructor(aModel, anEntityName, aKeyName) {
        if (!aModel) throw "'aModel' ia required argument";
        if (!anEntityName) throw "'anEntityName' ia required argument";
        if (!aKeyName) throw "'aKeyName' ia required argument";

        this.model = aModel;
        this.queryProxy = new QueryProxy(anEntityName);
        this.keyName = aKeyName;
        this.byKey = new Map();
        this.orderers = {};
        this.scalars = {};
        this.collections = {};
    }

    get name() {
        return this.queryProxy.entityName;
    }

    findByKey(keyValue) {
        return this.byKey.get(keyValue);
    }

    findBy(aCriteria) {
        let keys = Object.keys(aCriteria);
        keys = keys.sort();
        const ordererKey = keys.join(' | ');
        let orderer = this.orderers[ordererKey];
        if (!orderer) {
            orderer = new Orderer(keys);
            this.byKey.forEach(item => {
                orderer.add(item);
            });
            this.orderers[ordererKey] = orderer;
        }
        return orderer.find(aCriteria);
    }

    wrapDatum(datum) {
        const self = this;
        const proxiedDatum = new Proxy(datum, M.manageObject({
            has: (target, key) => {
                return self.scalars.hasOwnProperty(key) || self.collections.hasOwnProperty(key);
            },
            get: (target, key) => {
                if (self.scalars.hasOwnProperty(key)) {
                    const scalarDefinition = self.scalars[key];
                    const primitive = proxiedDatum[scalarDefinition.field];
                    const scalar = scalarDefinition.target.findByKey(primitive);
                    if (primitive != null && scalar == null) {
                        throw `Unresolved reference '${scalarDefinition.target.name} (${primitive})' in entity '${self.name} (${proxiedDatum[self.keyName]})'`;
                    } else {
                        return scalar;
                    }
                } else if (self.collections.hasOwnProperty(key)) {
                    const collection = self.collections[key];
                    const criterion = {};
                    criterion[collection.field] = proxiedDatum[self.keyName];
                    return collection.source.findBy(criterion);
                }
            },
            set: (target, key, value) => {
                const scalarDefinition = self.scalars[key];
                proxiedDatum[scalarDefinition.field] = value ? value[scalarDefinition.target.keyName] : null;
                M.fire(proxiedDatum, {
                    source: proxiedDatum,
                    propertyName: key,
                    oldValue: value,
                    newValue: value
                });
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
                update.keys[self.keyName] = self.keyName === change.propertyName ? change.oldValue : datum[self.keyName];
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
        self.byKey.set(datum[self.keyName], proxiedDatum);
        return proxiedDatum;
    }

    wrapData(data) {
        const self = this;
        const proxiedData = new Proxy(data.map(datum => {
            if (self.byKey.has(datum[self.keyName])) {
                return self.byKey.get(datum[self.keyName]);
            } else {
                return self.wrapDatum(datum);
            }
        }), M.manageArray());
        M.listen(proxiedData, {
            spliced: (added, deleted) => {
                added.forEach(aAdded => {
                    // If a key is already assigned, than we have to preserve its value
                    if (!aAdded[self.keyName]) {
                        aAdded[self.keyName] = Id.next();
                    }
                    const insertChange = {kind: 'insert', entity: self.queryProxy.entityName, data: {}};
                    for (let na in aAdded) {
                        insertChange.data[na] = aAdded[na];
                    }
                    self.model.changeLog.push(insertChange);
                });
                deleted.forEach(aDeleted => {
                    const deleteChange = {kind: 'delete', entity: self.queryProxy.entityName, keys: {}};
                    // changeLog keys for delete
                    deleteChange.keys[self.keyName] = aDeleted[self.keyName];
                    self.model.changeLog.push(deleteChange);
                    // remove from groups
                    Object.values(self.orderers).forEach(orderer => orderer.remove(aDeleted));
                    self.byKey.delete(aDeleted[self.keyName]);
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