import Id from 'septima-utils/id';
import Invoke from 'septima-utils/invoke';
import Logger from 'septima-utils/logger';
import Requests from 'septima-remote/requests';
import M from './managed';
import Orderer from './orderer';

class Query {
    constructor(entityName) {
        function prepareCommandRequest(parameters) {
            const command = {
                kind: 'command',
                entity: entityName,
                parameters: {}
            };
            for (let p in parameters)
                command.parameters[p] = parameters[p];
            return command;
        }

        function requestData(parameters, manager) {
            return Requests.requestData(entityName, parameters, manager);
        }

        Object.defineProperty(this, 'entityName', {
            get: function () {
                return entityName;
            },
            set: function (aValue) {
                entityName = aValue;
            }
        });

        Object.defineProperty(this, 'requestData', {
            get: function () {
                return requestData;
            }
        });
        Object.defineProperty(this, 'prepareCommandRequest', {
            get: function () {
                return prepareCommandRequest;
            }
        });
    }
}

class Entity extends Array {
    constructor(serverEntityName) {
        super();

        const self = this;

        // Entity's chnge log is used as well ass model.changeLog to 
        // accomplish future changeLog replay while revert feature.
        let changeLog = [];

        const scalarNavigationProperties = new Map();
        const collectionNavigationProperties = new Map();

        function addScalarNavigation(aNavigation) {
            scalarNavigationProperties.set(aNavigation.name, aNavigation);
        }

        function addCollectionNavigation(aNavigation) {
            collectionNavigationProperties.set(aNavigation.name, aNavigation);
        }

        function clearScalarNavigations() {}
        scalarNavigationProperties.clear();

        function clearCollectionNavigations() {
            collectionNavigationProperties.clear();
        }

        let onRequery = null;
        let lastSnapshot = [];
        let title = '';
        let name = '';
        let model = null;
        const queryProxy = new Query(serverEntityName);
        let elementClass = null;
        const inRelations = new Set();
        const outRelations = new Set();
        // TODO: Add keysNames filling
        const keysNames = new Set();
        const requiredNames = new Set();


        let valid = false;
        let pending = null;

        const parameters = {};

        function inRelatedValid() {
            let allvalid = true;
            inRelations.forEach(relation => {
                if (relation.leftEntity && !relation.leftEntity.valid) {
                    allvalid = false;
                }
            });
            return allvalid;
        }

        function fromRight() {
            const right = [];
            outRelations.forEach(relation => {
                right.push(relation.rightEntity);
            });
            return right;
        }

        function collectRight() {
            const collected = new Set();
            // Breadth first collecting
            const right = fromRight();
            for (let r = 0; r < right.length; r++) {
                const rightEntity = right[r];
                collected.add(rightEntity);
                right.push(...rightEntity.fromRight());
            }
            return Array.from(collected);
        }

        function invalidate() {
            valid = false;
        }

        function bindParameters() {
            inRelations.forEach(relation => {
                const source = relation.leftEntity;
                if (relation.leftItem) {
                    let leftValue;
                    if (relation.leftParameter) {
                        leftValue = source.params[relation.leftItem];
                    } else {
                        if (source.cursor) {
                            leftValue = source.cursor[relation.leftItem];
                        } else if (source.length > 0) {
                            leftValue = source[0][relation.leftItem];
                        } else {
                            leftValue = null;
                        }
                    }
                    parameters[relation.rightItem] = typeof leftValue === 'undefined' ? null : leftValue;
                }
            });
        }

        function start(manager) {
            if (pending)
                throw "Can't start new data request, while previous data request is in progress";
            if (valid)
                throw "Can't start data request for valid entity";
            if (keysNames.size === 0)
                Logger.warning(`'keysNames' for '${name}' are absent. Keys auto generation and 'findByKey()' will not work properly`);
            bindParameters();
            pending = queryProxy.requestData(parameters, manager)
                    .then(data => {
                        acceptData(data, true);
                        lastSnapshot = data;
                        pending = null;
                        valid = true;
                        if (onRequery) {
                            Invoke.later(onRequery);
                        }
                    })
                    .catch(reason => {
                        valid = true;
                        pending = null;
                        throw reason;
                    });
            return pending;
        }

        function enqueueUpdate(params) {
            const command = queryProxy.prepareCommandRequest(params);
            model.changeLog.push(command);
        }

        function requestData(params, manager) {
            return queryProxy.requestData(params, manager);
        }

        function requery(manager) {
            const toInvalidate = [self];
            toInvalidate.push(...collectRight());
            return model.start(toInvalidate, manager);
        }

        function append(data) {
            acceptData(data, false);
        }

        function update(params, manager) {
            const command = queryProxy.prepareCommandRequest(params);
            return Requests.requestCommit([command], manager);
        }

        function isPk(aPropertyName) {
            return keysNames.has(aPropertyName);
        }

        function isRequired(aPropertyName) {
            return requiredNames.has(aPropertyName);
        }

        class Insert {
            constructor(aEntityName) {
                this.kind = 'insert';
                this.entity = aEntityName;
                this.data = {};
            }
        }

        class Delete {
            constructor(aEntityName) {
                this.kind = 'delete';
                this.entity = aEntityName;
                this.keys = {};
            }
        }

        class Update {
            constructor(aEntityName) {
                this.kind = 'update';
                this.entity = aEntityName;
                this.keys = {};
                this.data = {};
            }
        }

        function fireSelfScalarsOppositeCollectionsChanges(aSubject, aChange) {
            const expandingsOldValues = aChange.beforeState.selfScalarsOldValues;
            scalarNavigationProperties.forEach((ormDef, scalarName) => {
                if (aChange.propertyName === ormDef.baseName) {
                    const ormDefOppositeName = ormDef.oppositeName;
                    const expandingOldValue = expandingsOldValues[scalarName];
                    const expandingNewValue = aSubject[scalarName];
                    M.fire(aSubject, {
                        source: aChange.source,
                        propertyName: scalarName,
                        oldValue: expandingOldValue,
                        newValue: expandingNewValue
                    });
                    if (ormDefOppositeName) {
                        if (expandingOldValue) {
                            M.fire(expandingOldValue, {
                                source: expandingOldValue,
                                propertyName: ormDefOppositeName
                            });
                        }
                        if (expandingNewValue) {
                            M.fire(expandingNewValue, {
                                source: expandingNewValue,
                                propertyName: ormDefOppositeName
                            });
                        }
                    }
                }
            });
        }

        function prepareSelfScalarsChanges(aSubject, aChange) {
            const oldScalarValues = [];
            scalarNavigationProperties.forEach((ormDef, scalarName) => {
                if (aChange.propertyName === ormDef.baseName && scalarName) {
                    oldScalarValues[scalarName] = aSubject[scalarName];
                }
            });
            return oldScalarValues;
        }

        function fireOppositeScalarsSelfCollectionsChanges(aSubject, aChange) {
            const oppositeScalarsFirerers = aChange.beforeState.oppositeScalarsFirerers;
            if (oppositeScalarsFirerers) {
                oppositeScalarsFirerers.forEach(aFirerer => {
                    aFirerer();
                });
            }
            collectionNavigationProperties.forEach((ormDef, collectionName) => {
                const collection = aSubject[collectionName];
                collection.forEach(item => {
                    M.fire(item, {
                        source: item,
                        propertyName: ormDef.oppositeName
                    });
                });
            });
            collectionNavigationProperties.forEach((ormDef, collectionName) => {
                M.fire(aSubject, {
                    source: aSubject,
                    propertyName: collectionName
                });
            });
        }

        function prepareOppositeScalarsChanges(aSubject) {
            const firerers = [];
            collectionNavigationProperties.forEach((ormDef, collectionName) => {
                const collection = aSubject[collectionName];
                collection.forEach(item => {
                    const ormDefOppositeName = ormDef.oppositeName;
                    if (ormDefOppositeName) {
                        firerers.push(() => {
                            M.fire(item, {
                                source: item,
                                propertyName: ormDefOppositeName
                            });
                        });
                    }
                });
            });
            return firerers;
        }

        function fireOppositeScalarsChanges(aSubject) {
            const collected = prepareOppositeScalarsChanges(aSubject);
            collected.forEach(aFirerer => {
                aFirerer();
            });
        }

        function fireOppositeCollectionsChanges(aSubject) {
            scalarNavigationProperties.forEach((ormDef, scalarName) => {
                const scalar = aSubject[scalarName];
                if (scalar && ormDef.oppositeName) {
                    M.fire(scalar, {
                        source: scalar,
                        propertyName: ormDef.oppositeName
                    });
                }
            });
        }

        let justInserted = null;
        let justInsertedChange = null;
        let orderers = {};

        let onChange = null;

        function managedOnChange(aSubject, aChange) {
            if (!tryToComplementInsert(aSubject, aChange)) {
                const updateChange = new Update(queryProxy.entityName);
                // Generate changeLog keys for update
                keysNames.forEach(keyName => {
                    // Tricky processing of primary keys modification case.
                    updateChange.keys[keyName] = keyName === aChange.propertyName ? aChange.oldValue : aSubject[keyName];
                });
                updateChange.data[aChange.propertyName] = aChange.newValue;
                changeLog.push(updateChange);
                model.changeLog.push(updateChange);
            }
            Object.keys(orderers).forEach(aOrdererKey => {
                const aOrderer = orderers[aOrdererKey];
                if (aOrderer.inKeys(aChange.propertyName)) {
                    aOrderer.add(aChange.source);
                }
            });
            M.fire(aSubject, aChange);
            fireSelfScalarsOppositeCollectionsChanges(aSubject, aChange); // Expanding change
            if (isPk(aChange.propertyName)) {
                fireOppositeScalarsSelfCollectionsChanges(aSubject, aChange);
            }
            if (onChange) {
                Invoke.later(() => {
                    onChange(aChange);
                });
            }
        }

        function managedBeforeChange(aSubject, aChange) {
            const oldScalars = prepareSelfScalarsChanges(aSubject, aChange);
            const oppositeScalarsFirerers = prepareOppositeScalarsChanges(aSubject);
            Object.keys(orderers).forEach(aOrdererKey => {
                const aOrderer = orderers[aOrdererKey];
                if (aOrderer.inKeys(aChange.propertyName)) {
                    aOrderer['delete'](aChange.source);
                }
            });
            return {
                selfScalarsOldValues: oldScalars,
                oppositeScalarsFirerers
            };
        }

        function tryToComplementInsert(aSubject, aChange) {
            let complemented = false;
            if (aSubject === justInserted && isRequired(aChange.propertyName)) {
                let met = false;
                const iData = justInsertedChange.data;
                for (let d in iData) {
                    // Warning. Don't edit as === .
                    if (d == aChange.propertyName) {
                        met = true;
                        break;
                    }
                }
                if (!met) {
                    iData[aChange.propertyName] = aChange.newValue;
                    complemented = true;
                }
            }
            return complemented;
        }

        function acceptInstance(aSubject) {
            for (let fieldName in aSubject) {
                if (typeof aSubject[fieldName] === 'undefined')
                    aSubject[fieldName] = null;
            }
            M.manageObject(aSubject, managedOnChange, managedBeforeChange);
            M.listenable(aSubject);
            // ORM mutable scalar properties
            scalarNavigationProperties.forEach((scalarDef, scalarName) => {
                Object.defineProperty(aSubject, scalarName, scalarDef);
            });
            // ORM mutable collection properties
            collectionNavigationProperties.forEach((collectionDef, collectionName) => {
                Object.defineProperty(aSubject, collectionName, collectionDef);
            });
        }

        let onInsert = null;
        let onDelete = null;

        M.manageArray(this, {
            spliced: function (added, deleted) {
                added.forEach(aAdded => {
                    justInserted = aAdded;
                    justInsertedChange = new Insert(queryProxy.entityName);
                    keysNames.forEach(keyName => {
                        if (!aAdded[keyName]) // If key is already assigned, than we have to preserve its value
                            aAdded[keyName] = Id.generate();
                    });
                    for (let na in aAdded) {
                        justInsertedChange.data[na] = aAdded[na];
                    }
                    changeLog.push(justInsertedChange);
                    model.changeLog.push(justInsertedChange);
                    for (let aOrdererKey in orderers) {
                        const aOrderer = orderers[aOrdererKey];
                        aOrderer.add(aAdded);
                    }
                    acceptInstance(aAdded);
                    fireOppositeScalarsChanges(aAdded);
                    fireOppositeCollectionsChanges(aAdded);
                });
                deleted.forEach(aDeleted => {
                    if (aDeleted === justInserted) {
                        justInserted = null;
                        justInsertedChange = null;
                    }
                    const deleteChange = new Delete(queryProxy.entityName);
                    // Generate changeLog keys for delete
                    keysNames.forEach(keyName => {
                        // Tricky processing of primary keys modification case.
                        deleteChange.keys[keyName] = aDeleted[keyName];
                    });
                    changeLog.push(deleteChange);
                    model.changeLog.push(deleteChange);
                    for (let aOrdererKey in orderers) {
                        const aOrderer = orderers[aOrdererKey];
                        aOrderer['delete'](aDeleted);
                    }
                    fireOppositeScalarsChanges(aDeleted);
                    fireOppositeCollectionsChanges(aDeleted);
                    M.unlistenable(aDeleted);
                    M.unmanageObject(aDeleted);
                });
                if (onInsert && added.length > 0) {
                    Invoke.later(() => {
                        onInsert({
                            source: self,
                            items: added
                        });
                    });
                }
                if (onDelete && deleted.length > 0) {
                    Invoke.later(() => {
                        onDelete({
                            source: self,
                            items: deleted
                        });
                    });
                }
                M.fire(self, {
                    source: self,
                    propertyName: 'length'
                });
            }
        });
        let onScroll = null;
        let cursor = null;

        function scrolled(aValue) {
            const oldCursor = cursor;
            const newCursor = aValue;
            cursor = aValue;
            if (onScroll) {
                Invoke.later(() => {
                    onScroll({
                        source: self,
                        propertyName: 'cursor',
                        oldValue: oldCursor,
                        newValue: newCursor
                    });
                });
            }
            M.fire(self, {
                source: self,
                propertyName: 'cursor',
                oldValue: oldCursor,
                newValue: newCursor
            });
        }
        M.listenable(this);

        function find(aCriteria) {
            if (typeof aCriteria === 'function' && Array.prototype.find) {
                return Array.prototype.find.call(self, aCriteria);
            } else {
                let keys = Object.keys(aCriteria);
                keys = keys.sort();
                const ordererKey = keys.join(' | ');
                let orderer = orderers[ordererKey];
                if (!orderer) {
                    orderer = new Orderer(keys);
                    self.forEach(item => {
                        orderer.add(item);
                    });
                    orderers[ordererKey] = orderer;
                }
                const found = orderer.find(aCriteria);
                return found;
            }
        }

        function findByKey(aKeyValue) {
            if (keysNames.size > 0) {
                const criteria = {};
                keysNames.forEach(keyName => {
                    criteria[keyName] = aKeyValue;
                });
                const found = find(criteria);
                return found.length > 0 ? found[0] : null;
            } else {
                return null;
            }
        }

        function findById(aKeyValue) {
            Logger.warning('findById() is deprecated. Use findByKey() instead.');
            return findByKey(aKeyValue);
        }

        const toBeDeletedMark = '-septima-to-be-deleted-mark';

        function remove(toBeDeleted) {
            toBeDeleted = toBeDeleted.forEach ? toBeDeleted : [toBeDeleted];
            toBeDeleted.forEach(anInstance => {
                anInstance[toBeDeletedMark] = true;
            });
            for (let d = self.length - 1; d >= 0; d--) {
                if (self[d][toBeDeletedMark]) {
                    self.splice(d, 1);
                }
            }
            toBeDeleted.forEach(anInstance => {
                delete anInstance[toBeDeletedMark];
            });
        }

        function acceptData(aData, aFreshData) {
            if (aFreshData) {
                Array.prototype.splice.call(self, 0, self.length);
            }
            for (let s = 0; s < aData.length; s++) {
                const dataRow = aData[s];
                let accepted;
                if (elementClass) {
                    accepted = new elementClass();
                } else {
                    accepted = {};
                }
                for (let sp in dataRow) {
                    accepted[sp] = dataRow[sp];
                }
                Array.prototype.push.call(self, accepted);
                acceptInstance(accepted);
            }
            orderers = {};
            M.fire(self, {
                source: self,
                propertyName: 'length'
            });
            self.forEach(aItem => {
                fireOppositeScalarsChanges(aItem);
                fireOppositeCollectionsChanges(aItem);
            });
        }

        // TODO: Eliminatre snapshots and transform snapshots feature.
        function commit() {
            lastSnapshot = [];
            self.forEach(aItem => {
                const cloned = {};
                for (let aFieldName in aItem) {
                    const typeOfField = typeof aItem[aFieldName];
                    if (typeOfField === 'undefined' || typeOfField === 'function')
                        cloned[aFieldName] = null;
                    else
                        cloned[aFieldName] = aItem[aFieldName];
                }
                lastSnapshot.push(cloned);
            });
            changeLog = [];
        }

        // TODO: Change revert implementation to changeLog undo.
        function revert() {
            if (lastSnapshot) {
                acceptData(lastSnapshot, true);
            }
            changeLog = [];
        }

        function addInRelation(relation) {
            inRelations.add(relation);
        }

        function addOutRelation(relation) {
            outRelations.add(relation);
        }

        Object.defineProperty(this, 'keysNames', {
            get: function () {
                return keysNames;
            }
        });
        Object.defineProperty(this, 'params', {
            get: function () {
                return parameters;
            }
        });
        Object.defineProperty(this, 'cursor', {
            get: function () {
                return cursor;
            },
            set: function (aValue) {
                scrolled(aValue);
            }
        });
        Object.defineProperty(this, 'revert', {
            get: function () {
                return revert;
            }
        });
        Object.defineProperty(this, 'commit', {
            get: function () {
                return commit;
            }
        });
        Object.defineProperty(this, 'find', {
            get: function () {
                return find;
            }
        });
        Object.defineProperty(this, 'findByKey', {
            get: function () {
                return findByKey;
            }
        });
        Object.defineProperty(this, 'findById', {
            get: function () {
                return findById;
            }
        });
        Object.defineProperty(this, 'remove', {
            get: function () {
                return remove;
            }
        });
        Object.defineProperty(this, 'onScroll', {
            get: function () {
                return onScroll;
            },
            set: function (aValue) {
                onScroll = aValue;
            }
        });
        Object.defineProperty(this, 'onInsert', {
            get: function () {
                return onInsert;
            },
            set: function (aValue) {
                onInsert = aValue;
            }
        });
        Object.defineProperty(this, 'onDelete', {
            get: function () {
                return onDelete;
            },
            set: function (aValue) {
                onDelete = aValue;
            }
        });
        Object.defineProperty(this, 'onChange', {
            get: function () {
                return onChange;
            },
            set: function (aValue) {
                onChange = aValue;
            }
        });
        Object.defineProperty(this, 'onRequeried', {
            get: function () {
                return onRequery;
            },
            set: function (aValue) {
                onRequery = aValue;
            }
        });
        Object.defineProperty(this, 'onRequery', {
            get: function () {
                return onRequery;
            },
            set: function (aValue) {
                onRequery = aValue;
            }
        });
        Object.defineProperty(this, 'elementClass', {
            get: function () {
                return elementClass;
            },
            set: function (aValue) {
                elementClass = aValue;
            }
        });
        Object.defineProperty(this, 'enqueueUpdate', {
            get: function () {
                return enqueueUpdate;
            }
        });
        Object.defineProperty(this, 'executeUpdate', {
            get: function () {
                return executeUpdate;
            }
        });
        Object.defineProperty(this, 'execute', {
            get: function () {
                return execute;
            }
        });
        Object.defineProperty(this, 'proxy', {
            get: function () {
                return queryProxy;
            }
        });
        Object.defineProperty(this, 'query', {
            get: function () {
                return requestData;
            }
        });
        Object.defineProperty(this, 'requery', {
            get: function () {
                return requery;
            }
        });
        Object.defineProperty(this, 'append', {
            get: function () {
                return append;
            }
        });
        Object.defineProperty(this, 'update', {
            get: function () {
                return update;
            }
        });
        Object.defineProperty(this, 'title', {
            get: function () {
                return title;
            },
            set: function (aValue) {
                title = aValue;
            }
        });
        Object.defineProperty(this, 'name', {
            get: function () {
                return name;
            },
            set: function (aValue) {
                name = aValue;
            }
        });
        Object.defineProperty(this, 'model', {
            get: function () {
                return model;
            },
            set: function (aValue) {
                model = aValue;
            }
        });
        Object.defineProperty(this, 'addInRelation', {
            get: function () {
                return addInRelation;
            }
        });
        Object.defineProperty(this, 'addOutRelation', {
            get: function () {
                return addOutRelation;
            }
        });
        Object.defineProperty(this, 'valid', {
            get: function () {
                return valid;
            },
            set: function (aValue) {
                valid = aValue;
            }
        });
        Object.defineProperty(this, 'pending', {
            get: function () {
                return !!pending;
            }
        });
        Object.defineProperty(this, 'start', {
            get: function () {
                return start;
            }
        });
        Object.defineProperty(this, 'invalidate', {
            get: function () {
                return invalidate;
            }
        });
        Object.defineProperty(this, 'inRelatedValid', {
            get: function () {
                return inRelatedValid;
            }
        });
        Object.defineProperty(this, 'fromRight', {
            get: function () {
                return fromRight;
            }
        });
        Object.defineProperty(this, 'collectRight', {
            get: function () {
                return collectRight;
            }
        });
        Object.defineProperty(this, 'addScalarNavigation', {
            get: function () {
                return addScalarNavigation;
            }
        });
        Object.defineProperty(this, 'addCollectionNavigation', {
            get: function () {
                return addCollectionNavigation;
            }
        });
        Object.defineProperty(this, 'clearScalarNavigations', {
            get: function () {
                return clearScalarNavigations;
            }
        });
        Object.defineProperty(this, 'clearCollectionNavigations', {
            get: function () {
                return clearCollectionNavigations;
            }
        });
    }
}
export default Entity;