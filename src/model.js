import Invoke from 'core/invoke';
import M from './managed';
import Requests from 'remote/requests';
import Logger from 'core/logger';

class Model {
    constructor() {
        const self = this;
        const relations = new Set();
        const referenceRelations = new Set();
        const entities = new Set();
        let changeLog = [];

        function addRelation(relation) {
            relations.add(relation);
        }

        function addAssociation(referenceRelation) {
            referenceRelations.add(referenceRelation);
        }

        function addEntity(entity) {
            entity.model = self;
            entities.add(entity);
            self[entity.name] = entity;
        }

        function start(toInvalidate, onSuccess, onFailure) {
            function entitiesValid() {
                let valid = true;
                entities.forEach(entity => {
                    if (!entity.valid) {
                        valid = false;
                    }
                });
                return valid;
            }

            function entitiesPending() {
                let pendingMet = false;
                entities.forEach(entity => {
                    if (entity.pending) {
                        pendingMet = true;
                    }
                });
                return pendingMet;
            }

            const failures = [];

            function complete(failureReason) {
                if (failureReason)
                    failures.push(failureReason);
                if (entitiesValid()) {
                    if (failures.length > 0) {
                        if (onFailure) {
                            onFailure(failures);
                        }
                    } else {
                        if (onSuccess) {
                            onSuccess();
                        }
                    }
                } else {
                    pushInvalidToPending();
                }
            }

            function pushInvalidToPending() {
                entities.forEach(entity => {
                    if (!entity.valid && !entity.pending && entity.inRelatedValid()) {
                        entity.start(() => {
                            complete(null);
                        }, reason => {
                            complete(reason);
                        });
                    }
                });
            }

            if (entitiesPending()) {
                throw "Can't start new data quering process while previous is in progress";
            } else {
                toInvalidate.forEach(entity => {
                    entity.invalidate();
                });
                if (entitiesValid()) { // In case of empty model, there are will not be invalid entities, even after invalidation.
                    if (onSuccess) {
                        Invoke.later(onSuccess);
                    }
                } else {
                    pushInvalidToPending();
                }
            }
        }

        function cancel() {
            entities.forEach(entity => {
                if (entity.pending) {
                    entity.cancel();
                } else if (!entity.valid) {
                    entity.valid = true;
                }
            });
        }

        function requery(onSuccess, onFailure) {
            if (onSuccess) {
                const toInvalidate = Array.from(entities);
                start(toInvalidate, onSuccess, onFailure);
            } else {
                throw "Synchronous Model.requery() method is not supported within browser client. So 'onSuccess' is required argument.";
            }
        }

        function revert() {
            changeLog = [];
            entities.forEach(e => {
                e.revert();
            });
        }

        function commited() {
            changeLog = [];
            entities.forEach(e => {
                e.commit();
            });
        }

        function rolledback() {
            Logger.info("Model changes are rolled back");
        }

        function save(onSuccess, onFailure) {
            if (onSuccess) {
                // Warning! We have to support both per entitiy changeLog and model's changeLog, because of order of changes.
                Requests.requestCommit(changeLog, touched => {
                    commited();
                    onSuccess(touched);
                }, e => {
                    rolledback();
                    onFailure(e);
                });
            } else {
                throw "'onSuccess' is required argument";
            }
        }

        function ScalarNavigation(relation) {
            this.enumerable = false;
            this.configurable = true;
            this.get = function () {
                const criterion = {};
                criterion[relation.rightField] = this[relation.leftField]; // Warning! 'this' here is data array's element!
                const found = relation.rightEntity.find(criterion);
                return found && found.length === 1 ? found[0] : null;
            };
            this.set = function (aValue) {
                this[relation.leftField] = aValue ? aValue[relation.rightField] : null;
            };
            this.name = relation.scalarPropertyName;
            this.oppositeName = relation.collectionPropertyName;
            this.baseName = relation.leftField;
        }

        function CollectionNavigation(relation) {
            this.enumerable = false;
            this.configurable = true;
            this.get = function () {
                const criterion = {};
                const targetKey = this[relation.rightField]; // Warning! 'this' here is data array's element!
                criterion[relation.leftField] = targetKey;
                const found = relation.leftEntity.find(criterion);
                M.manageArray(found, {
                    spliced: function (added, deleted) {
                        added.forEach(item => {
                            item[relation.leftField] = targetKey;
                        });
                        deleted.forEach(item => {
                            item[relation.leftField] = null;
                        });
                        M.fire(found, {
                            source: found,
                            propertyName: 'length'
                        });
                    },
                    scrolled: function (aSubject, oldCursor, newCursor) {
                        M.fire(found, {
                            source: found,
                            propertyName: 'cursor',
                            oldValue: oldCursor,
                            newValue: newCursor
                        });
                    }
                });
                M.listenable(found);
                return found;
            };
            this.name = relation.collectionPropertyName;
            this.oppositeName = relation.scalarPropertyName;
        }

        function processAssociations() {
            entities.forEach(entity => {
                entity.clearScalarNavigations();
                entity.clearCollectionNavigations();
            });
            referenceRelations.forEach(relation => {
                if (relation.scalarPropertyName)
                    relation.leftEntity.addScalarNavigation(new ScalarNavigation(relation));
                if (relation.collectionPropertyName)
                    relation.rightEntity.addCollectionNavigation(new CollectionNavigation(relation));
            });
        }

        Object.defineProperty(this, 'start', {
            get: function () {
                return start;
            }
        });
        Object.defineProperty(this, 'cancel', {
            get: function () {
                return cancel;
            }
        });
        Object.defineProperty(this, 'requery', {
            get: function () {
                return requery;
            }
        });
        Object.defineProperty(this, 'revert', {
            get: function () {
                return revert;
            }
        });
        Object.defineProperty(this, 'save', {
            get: function () {
                return save;
            }
        });
        Object.defineProperty(this, 'changeLog', {
            get: function () {
                return changeLog;
            }
        });
        Object.defineProperty(this, 'modified', {
            get: function () {
                return changeLog && changeLog.length > 0;
            }
        });
        Object.defineProperty(this, 'addRelation', {
            get: function () {
                return addRelation;
            }
        });
        Object.defineProperty(this, 'addAssociation', {
            get: function () {
                return addAssociation;
            }
        });
        Object.defineProperty(this, 'addEntity', {
            get: function () {
                return addEntity;
            }
        });
        Object.defineProperty(this, 'processAssociations', {
            get: function () {
                return processAssociations;
            }
        });
    }
}
export default Model;