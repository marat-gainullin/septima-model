/* global Promise */

import Invoke from 'septima-utils/invoke';
import Logger from 'septima-utils/logger';
import Requests from 'septima-remote/requests';
import M from './managed';

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

        function start(toInvalidate, manager) {
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

            function invalidToPending(roundManager) {
                const entitiesRequests = [];
                roundManager.cancel = function () {
                    entitiesRequests.forEach((entityRequest) => {
                        entityRequest.cancel();
                    });
                };
                return Promise.all(entities
                        .filter(entity => {
                            return !entity.valid && !entity.pending && entity.inRelatedValid();
                        })
                        .map(entity => {
                            const request = {};
                            entitiesRequests.push(request);
                            return entity.start(request);
                        }));
            }

            if (entitiesPending()) {
                return Promise.reject("Can't start new data quering process while previous is in progress");
            } else {
                toInvalidate.forEach(entity => {
                    entity.invalidate();
                });
                return new Promise((resolve, reject) => {
                    const reasons = [];
                    function nextRound() {
                        if (entitiesValid()) {
                            delete manager.cancel;
                            if (reasons.length === 0) {
                                resolve();
                            } else {
                                reject(reasons);
                            }
                        } else {
                            invalidToPending(manager)
                                    .then(nextRound)
                                    .catch((roundReasons) => {
                                        reasons.push(...roundReasons);
                                        nextRound();
                                    });
                        }
                    }
                    nextRound();
                });
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

        function requery(manager) {
            const toInvalidate = Array.from(entities);
            start(toInvalidate, manager);
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

        function save(manager) {
            // Warning! We have to support both per entitiy changeLog and model's changeLog, because of order of changes.
            return Requests.requestCommit(changeLog, manager)
                    .then(touched => {
                        commited();
                        return touched;
                    })
                    .catch(ex => {
                        rolledback();
                        throw ex;
                    });
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