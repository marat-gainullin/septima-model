/* global expect, spyOn */

import sinon from 'sinon';
import Id from 'septima-utils/id';
import Invoke from 'septima-utils/invoke';
import Resource from 'septima-remote/resource';
import Requests from 'septima-remote/requests';
import Orm from '../src/orm';
import Model from '../src/model';
import Entity from '../src/entity';

describe('Model Orm and orderers. ', () => {
    let ownersData = [
        {owners_id: 142841834950629, firstname: 'Peter', lastname: 'Petrov', address: 'Petrovskaya street', city: 'Saint Petersburg', telephone: '+79022222222', email: 'peter.owner@rambler.ru'},
        {owners_id: 146158832109238, firstname: 'Flint', lastname: 'Barlou', address: 'Beautiful street', city: 'Seattle', telephone: '+15687954632', email: 'fg@mail.yandex.ru'}
    ];
    let petsData = [
        {pets_id: 142841883974964, owner_id: 142841834950629, type_id: 142841300155478, name: 'Vasya', birthdate: new Date('2015-04-29T00:00:00.0')},
        {pets_id: 146158847483835, owner_id: 146158832109238, type_id: 142850046716850, name: 'Mickey', birthdate: new Date('2015-01-14T15:48:05.124')}
    ];
    const petTypes = [
        {pettypes_id: 142841300122653, name: 'Dog'},
        {pettypes_id: 142841300155478, name: 'Cat'},
        {pettypes_id: 142850046716850, name: 'Mouse'}
    ];
    function isHandledUrl(url) {
        return url.includes('application?');
    }

    let xhrSpy = sinon.useFakeXMLHttpRequest();
    xhrSpy.useFilters = true;
    xhrSpy.addFilter((method, url) => {
        return !isHandledUrl(url);
    });
    xhrSpy.onCreate = (xhr) => {
        function respondObj(xhr, bodyObj) {
            if (xhr.readyState !== 0) {
                xhr.respond(200, {"Content-Type": "application/json"}, JSON.stringify(bodyObj));
            } else {
                xhr.error();
            }
        }

        Invoke.later(() => {
            if (isHandledUrl(xhr.url)) {
                if (xhr.url.endsWith(`application?__type=${Requests.RequestTypes.rqAppQuery}&__queryId=pets`)) {
                    respondObj(xhr, {
                        appelement: 'pets',
                        title: 'pets entity',
                        fields: [
                            {name: 'pets_id', description: 'Pet primary key', type: 'Number', pk: true, nullable: false},
                            {name: 'type_id', description: "Pet's type reference", type: 'Number', nullable: false},
                            {name: 'owner_id', description: 'Owner reference field', type: 'Number', nullable: false},
                            {name: 'name', description: "Pet's name", type: 'String', nullable: false},
                            {name: 'birthdate', description: "Pet's bith date", type: 'Date', nullable: true}
                        ],
                        parameters: []
                    });
                } else if (xhr.url.endsWith(`application?__type=${Requests.RequestTypes.rqAppQuery}&__queryId=all-owners`)) {
                    respondObj(xhr, {
                        appelement: 'all-owners',
                        title: 'Owners entity',
                        fields: [
                            {name: 'owners_id', description: 'Owner primary key', type: 'Number', pk: true, nullable: false},
                            {name: 'firstname', description: "Owner's first name", type: 'String', nullable: false},
                            {name: 'lastname', description: "Owner's last name", type: 'String', nullable: true},
                            {name: 'address', description: "Owner's address", type: 'String', nullable: true},
                            {name: 'city', description: "Owner's city", type: 'String', nullable: true},
                            {name: 'telephone', description: "Owner's phone number", type: 'String', nullable: true},
                            {name: 'email', description: "Owner's email", type: 'String', nullable: true}
                        ],
                        parameters: []
                    });
                } else if (xhr.url.endsWith(`application?__type=${Requests.RequestTypes.rqExecuteQuery}&__queryId=pets`)) {
                    respondObj(xhr, petsData);
                } else if (xhr.url.includes(`application?__type=${Requests.RequestTypes.rqExecuteQuery}&__queryId=pets-of-owner`)) {
                    const ownerKey = xhr.url.match(/.+ownerKey=([\dnul]+).*/)[1];
                    respondObj(xhr, petsData.filter((pet) => {
                        return pet.owner_id == ownerKey;
                    }));
                } else if (xhr.url.includes(`application?__type=${Requests.RequestTypes.rqExecuteQuery}&__queryId=pet-of-owner`)) {
                    const ownerKey = xhr.url.match(/.+ownerKey=([\dnul]+).*/)[1];
                    const petKey = xhr.url.match(/.+petKey=([\dnul]+).*/)[1];
                    respondObj(xhr, petsData.filter((pet) => {
                        return pet.owner_id == ownerKey && pet.pets_id == petKey;
                    }));
                } else if (xhr.url.endsWith(`application?__type=${Requests.RequestTypes.rqExecuteQuery}&__queryId=all-owners`)) {
                    respondObj(xhr, ownersData);
                } else if (xhr.url.endsWith(`application?__type=${Requests.RequestTypes.rqCommit}`)) {
                    if (xhr.readyState !== 0) {
                        const log = JSON.parse(xhr.requestBody);
                        let affected = 0;
                        log.forEach((item) => {
                            console.log(item);
                            switch (item.entity) {
                                case 'all-owners':
                                    switch (item.kind) {
                                        case 'insert':
                                            ownersData.push(item.data);
                                            affected++;
                                            break;
                                        case 'delete':
                                            const wereOwners = ownersData.length;
                                            ownersData = ownersData.filter((owner) => {
                                                return owner.owners_id !== item.keys.owners_id;
                                            });
                                            affected += wereOwners - ownersData.length;
                                            break;
                                        case 'update':
                                            ownersData.filter((owner) => {
                                                return owner.owners_id === item.keys.owners_id;
                                            }).forEach((owner) => {
                                                for (let d in item.data) {
                                                    owner[d] = item.data[d];
                                                    affected++;
                                                }
                                            });
                                            break;
                                    }
                                    break;
                                case 'pets':
                                    switch (item.kind) {
                                        case 'insert':
                                            petsData.push(item.data);
                                            affected++;
                                            break;
                                        case 'delete':
                                            const werePets = petsData.length;
                                            petsData = petsData.filter((pet) => {
                                                return pet.pets_id !== item.keys.pets_id;
                                            });
                                            affected += werePets - petsData.length;
                                            break;
                                        case 'update':
                                            petsData.filter((pet) => {
                                                return pet.pets_id === item.keys.pets_id;
                                            }).forEach((pet) => {
                                                for (let d in item.data) {
                                                    pet[d] = item.data[d];
                                                    affected++;
                                                }
                                            });
                                            break;
                                    }
                                    break;
                                case 'add-pet':
                                    switch (item.kind) {
                                        case 'command':
                                            petsData.push({
                                                pets_id: item.parameters.id,
                                                owner_id: item.parameters.ownerId,
                                                type_id: item.parameters.typeId,
                                                name: item.parameters.name
                                            });
                                            affected++;
                                            break;
                                    }
                                    break;
                            }
                        });
                        respondObj(xhr, affected);
                    } else {
                        xhr.error();
                    }
                } else {
                    xhr.respond(404, {"Content-Type": "application/json"},
                            JSON.stringify({error: `Unknown url: ${xhr.url}`}));
                }
            }
        });
    };

    it('Creation Api', () => {
        const model = new Model();
        const model1 = new Orm.createModel();
        const entity = new Entity();
        expect(model).toBeDefined();
        expect(model instanceof Model).toBeTruthy();
        expect(model1).toBeDefined();
        expect(model1 instanceof Model).toBeTruthy();
        expect(entity).toBeDefined();
        expect(entity instanceof Array).toBeTruthy();
    });
    it('Model creation based on absent fetched document', () => {
        try {
            new Orm.createModel('absent-module');
        } catch (e) {
            expect(e).toBeTruthy();
        }
    });
    it('Model reading', () => {
        const model = new Orm.readModel('<?xml version="1.0" encoding="UTF-8"?><datamodel>'
                + '<entity entityId="id1" Name="e1" queryId="q1"></entity>'
                + '<entity entityId="id2" Name="e2" queryId="q2"></entity>'
                + '<entity entityId="id3" Name="e3" queryId="q3"></entity>'
                + '<relation></relation>'
                + '<referenceRelation></referenceRelation>'
                + '</datamodel>');
        expect(model).toBeDefined();
        expect(model.e1).toBeDefined();
        expect(model.e2).toBeDefined();
        expect(model.e3).toBeDefined();
    });
    it('requireEntities.success', done => {
        Orm.requireEntities(['pets', 'all-owners'], (petsEntity, ownersEntity) => {
            expect(petsEntity).toBeDefined();
            expect(petsEntity.fields).toBeDefined();
            expect(petsEntity.fields.length).toBeDefined();
            expect(petsEntity.fields.length).toEqual(5);
            expect(petsEntity.parameters).toBeDefined();
            expect(petsEntity.parameters.length).toBeDefined();
            expect(petsEntity.title).toBeDefined();
            expect(ownersEntity).toBeDefined();
            expect(ownersEntity.fields).toBeDefined();
            expect(ownersEntity.fields.length).toBeDefined();
            expect(ownersEntity.fields.length).toEqual(7);
            expect(ownersEntity.parameters).toBeDefined();
            expect(ownersEntity.parameters.length).toBeDefined();
            expect(ownersEntity.title).toBeDefined();
            done();
        }, done.fail);
    });
    it('requireEntities.failure', done => {
        Orm.requireEntities(['absent-entity'], () => {
            fail("'Orm.requireEntities' against absent entity should lead to an error");
            done();
        }, e => {
            expect(e).toBeDefined();
            done();
        });
    });
    it("'Entity.requery()' -> Some changes -> 'Entity.revert()'", done => {
        withRemotePetsModel((model) => {
            model.requery(() => {
                const oldLength = model.owners.length;
                expect(oldLength).toBeGreaterThan(1);
                const oldValue = model.owners[0].firstname;
                expect(model.changeLog).toBeDefined();
                expect(model.changeLog.length).toBeDefined();
                expect(model.changeLog.length).toEqual(0);
                model.owners[0].firstname += Id.generate();
                expect(model.changeLog.length).toEqual(1);
                model.owners.push({
                    owners_id: Id.generate()
                });
                expect(model.changeLog.length).toEqual(2);
                model.revert();
                expect(model.owners.length, oldLength);
                expect(model.owners[0].firstname).toEqual(oldValue);
                expect(model.changeLog.length).toEqual(0);
                done();
            }, done.fail);
        }, done.fail);
    });
    it('Requery graph', done => {
        withRemotePetsModel((model) => {
            let ownersRequeried = 0;
            model.owners.onRequeried = () => {
                ownersRequeried++;
            };
            let petsOfOwnerRequeried = 0;
            model.petsOfOwner.onRequeried = () => {
                petsOfOwnerRequeried++;
            };
            let petOfOwnerRequeried = 0;
            model.petOfOwner.onRequeried = () => {
                petOfOwnerRequeried++;
            };
            model.requery(() => {
                Invoke.later(() => {
                    expect(ownersRequeried).toEqual(1);
                    expect(petsOfOwnerRequeried).toEqual(1);
                    expect(petOfOwnerRequeried).toEqual(1);
                    done();
                });
            }, done.fail);
        }, done.fail);
    });
    it("Requery partial graph with 'Entity.requery() with dependents'", done => {
        withRemotePetsModel((model) => {
            let ownersRequeried = 0;
            model.owners.onRequeried = () => {
                ownersRequeried++;
            };
            let petsOfOwnerRequeried = 0;
            model.petsOfOwner.onRequeried = () => {
                petsOfOwnerRequeried++;
            };
            let petOfOwnerRequeried = 0;
            model.petOfOwner.onRequeried = () => {
                petOfOwnerRequeried++;
            };
            model.owners.requery(() => {
                Invoke.later(() => {
                    expect(ownersRequeried).toEqual(1);
                    expect(petsOfOwnerRequeried).toEqual(1);
                    expect(petOfOwnerRequeried).toEqual(1);
                    done();
                });
            }, done.fail);
        }, done.fail);
    });
    it("Requery graph after 'Model.cancel()' after one entity requeried", done => {
        withRemotePetsModel((model) => {
            let ownersRequeried = 0;
            model.owners.onRequeried = () => {
                ownersRequeried++;
                model.cancel();
            };
            let petsOfOwnerRequeried = 0;
            model.petsOfOwner.onRequeried = () => {
                petsOfOwnerRequeried++;
            };
            let petOfOwnerRequeried = 0;
            model.petOfOwner.onRequeried = () => {
                petOfOwnerRequeried++;
            };
            model.requery(() => {
                done.fail("Success callback of requery shouldn't be called after 'Model.cancel()'");
            }, reason => {
                expect(reason).toBeDefined();
                expect(ownersRequeried).toEqual(1);
                expect(model.owners.length).toBeGreaterThan(0);
                expect(petsOfOwnerRequeried).toEqual(0);
                expect(model.petsOfOwner.length).toEqual(0);
                expect(petOfOwnerRequeried).toEqual(0);
                expect(model.petOfOwner.length).toEqual(0);
                done();
            });
        }, done.fail);
    });
    it("Requery graph after 'Model.cancel()'.immediate", done => {
        withRemotePetsModel((model) => {
            let ownersRequeried = 0;
            model.owners.onRequeried = () => {
                ownersRequeried++;
            };
            let petsOfOwnerRequeried = 0;
            model.petsOfOwner.onRequeried = () => {
                petsOfOwnerRequeried++;
            };
            let petOfOwnerRequeried = 0;
            model.petOfOwner.onRequeried = () => {
                petOfOwnerRequeried++;
            };
            model.requery(() => {
                done.fail("Success callback of requery shouldn't be called after 'Model.cancel()'");
            }, reason => {
                expect(reason).toBeDefined();
                expect(ownersRequeried).toEqual(0);
                expect(model.owners.length).toEqual(0);
                expect(petsOfOwnerRequeried).toEqual(0);
                expect(model.petsOfOwner.length).toEqual(0);
                expect(petOfOwnerRequeried).toEqual(0);
                expect(model.petOfOwner.length).toEqual(0);
                done();
            });
            model.cancel();
        }, done.fail);
    });
    it("Entities' events", done => {
        withRemotePetsModel((model) => {
            let onRequiredCalled = 0;
            model.owners.onRequeried = () => {
                onRequiredCalled++;
            };
            let onChangeCalled = 0;
            model.owners.onChange = event => {
                onChangeCalled++;
                expect(event).toBeDefined();
                expect(event.source).toBeDefined();
                expect(event.propertyName).toBeDefined();
                expect(event.oldValue).toBeDefined();
                expect(event.newValue).toBeDefined();
            };
            let onInsertCalled = 0;
            model.owners.onInsert = event => {
                onInsertCalled++;
                expect(event).toBeDefined();
                expect(event.source).toBeDefined();
                expect(event.items).toBeDefined();
            };
            let onDeleteCalled = 0;
            model.owners.onDelete = event => {
                onDeleteCalled++;
                expect(event).toBeDefined();
                expect(event.source).toBeDefined();
                expect(event.items).toBeDefined();
            };
            expect(model.owners.onRequery === model.owners.onRequeried).toBeTruthy();
            model.requery(() => {
                expect(onRequiredCalled).toEqual(1);
                const newOwner = {
                    // Note! Only changes of those properties, that are in push/splice/unshift will be observable
                    // for changeLog and for onChange events!
                    owners_id: Id.generate(),
                    firstname: 'test-owner'
                };
                model.owners.push(newOwner);
                newOwner.firstname = 'test-owner-edited';
                model.owners.remove(newOwner);
                Invoke.later(() => {
                    expect(onInsertCalled).toEqual(1);
                    expect(onChangeCalled).toEqual(1);
                    expect(onDeleteCalled).toEqual(1);
                    done();
                });
            }, done.fail);
        }, done.fail);
    });
    it("Requery of model with command like entities", done => {
        withRemotePetsModel((model) => {
            model.addEntity(new Entity('add-pet'));
            model.requery(() => {
                done.fail("'model.requery()' with command like entity inside, should lead to an error");
            }, reason => {
                expect(reason).toBeDefined();
                done();
            });
        }, done.fail);
    });

    it("Extra and unknown to a backend properties", done => {
        withRemotePetsModel((model) => {
            model.requery(() => {
                model.owners[0].name += '-edited by test';
                const testOwner = {
                    owners_id: Id.generate(),
                    unknownproperty: 'should not be considered while translating to database'
                };
                model.owners.push(testOwner);
                model.save(result => {
                    expect(result).toBeDefined();
                    expect(result).toBeGreaterThanOrEqual(1);
                    done();
                }, done.fail);
            }, done.fail);
        }, done.fail);
    });
    it("'Entity.query()' -> 'Entity.append()' chain", done => {
        withRemotePetsModel(model => {
            model.owners.query({}, owners => {
                expect(owners).toBeDefined();
                expect(owners.length).toBeDefined();
                expect(owners.length).toBeGreaterThan(1);
                expect(model.owners.length).toEqual(0);
                model.owners.append(owners);
                expect(model.owners.length).toBeGreaterThan(1);
                done();
            }, done.fail);
        }, done.fail);
    });
    it("'Entity.update()'.params in order", done => {
        withRemotePetsModel((model) => {
            const addPet = new Entity('add-pet');
            model.addEntity(addPet);
            addPet.update({
                id: Id.generate(),
                ownerId: 142841834950629,
                typeId: 142841300122653,
                name: 'test-pet-1'
            }, result => {
                expect(result).toBeDefined();
                done();
            }, done.fail);
        }, done.fail);
    });
    it("'Entity.update()'.params out of order", done => {
        withRemotePetsModel((model) => {
            const addPet = new Entity('add-pet');
            model.addEntity(addPet);
            addPet.update({
                id: Id.generate(),
                typeId: 142841300122653,
                ownerId: 142841834950629,
                name: 'test-pet-2'
            }, result => {
                expect(result).toBeDefined();
                done();
            }, done.fail);
        }, done.fail);
    });
    it("'Entity.enqueueUpdate()'", done => {
        withRemotePetsModel((model) => {
            const addPet = new Entity('add-pet');
            model.addEntity(addPet);
            addPet.enqueueUpdate({
                id: Id.generate(),
                typeId: 142841300122653,
                ownerId: 142841834950629,
                name: 'test-pet-3'
            });
            model.save(result => {
                expect(result).toBeDefined();
                done();
            }, done.fail);
        }, done.fail);
    });
    it("'Model.save()'", done => {
        withRemotePetsModel((model) => {
            model.requery(() => {
                const newOwnerId = Id.generate();
                const updatedOwnerId = model.owners[0].owners_id;
                const upatedFirstName = model.owners[0].firstname + '-edited by test';
                model.owners[0].firstname = upatedFirstName;
                const testOwner = {
                    owners_id: newOwnerId,
                    firstname: 'test-owner-name',
                    lastname: `test-owner-surname-${newOwnerId}`,
                    email: 'john@doe.com'
                };
                model.owners.push(testOwner);
                model.save(result => {
                    expect(result).toBeDefined();
                    expect(result).toBeGreaterThanOrEqual(1);
                    model.requery(() => {
                        const justUpdatedOwner = model.owners.findByKey(updatedOwnerId);
                        expect(justUpdatedOwner).toBeDefined();
                        expect(justUpdatedOwner.firstname).toEqual(upatedFirstName);
                        
                        const justAddedOwner = model.owners.findByKey(newOwnerId);
                        expect(justAddedOwner).toBeDefined();
                        expect(justAddedOwner.lastname).toEqual(`test-owner-surname-${newOwnerId}`);
                        done();
                    }, reason => {
                        fail(reason);
                        done();
                    });
                }, done.fail);
            }, done.fail);
        }, done.fail);
    });

    function withRemotePetsModel(onSuccess, onFailure) {
        Resource.loadText('base/assets/entities/model-graph.model', loaded => {
            const model = Orm.readModel(loaded);
            model.owners.keysNames.add('owners_id');
            onSuccess(model);
        }, onFailure);
    }

    function withLocalPetsModel(onPrepared) {
        const pets = new Entity('pets');
        const owners = new Entity('owners');
        const model = new Model();
        model.addEntity(pets);
        model.addEntity(owners);
        model.addAssociation({
            leftEntity: pets,
            leftField: 'owner_id',
            rightEntity: owners,
            rightField: 'id',
            scalarPropertyName: 'owner',
            collectionPropertyName: 'pets'
        });
        model.processAssociations();
        const christy = {id: Id.generate(), name: 'Christy'};
        const jenny = {id: Id.generate(), name: 'Jenny'};
        owners.push.apply(owners, [
            christy,
            jenny
        ]);
        pets.push.apply(pets, [
            {id: Id.generate(), name: 'Spike', owner_id: christy.id},
            {id: Id.generate(), name: 'Pick', owner_id: jenny.id},
            {id: Id.generate(), name: 'Tom', owner_id: jenny.id},
            {id: Id.generate(), name: 'Jerry', owner_id: christy.id}
        ]);
        onPrepared(pets, owners, jenny, christy);
    }

    it('Navigation properties view', done => {
        withLocalPetsModel((pets, owners, jenny, christy) => {
            pets.forEach(pet => {
                expect(pet).toBeDefined();
                expect(pet.owner).toBeDefined();
                if (pet.owner === christy) {
                    expect(christy.pets.includes(pet)).toBeTruthy();
                } else if (pet.owner === jenny) {
                    expect(jenny.pets.includes(pet)).toBeTruthy();
                }
            });
            owners.forEach(owner => {
                expect(owner).toBeDefined();
                expect(owner.pets).toBeDefined();
                expect(owner.pets.length).toEqual(2);
                if (owner === christy) {
                    expect(owner.pets).toEqual(christy.pets);
                } else if (owner === jenny) {
                    expect(owner.pets).toEqual(jenny.pets);
                }
            });
            done();
        });
    });
    it('Navigation scalar properties edit', done => {
        withLocalPetsModel((pets, owners, jenny, christy) => {
            christy.pets.forEach(pet => {
                pet.owner = jenny;
            });
            expect(christy.pets.length).toEqual(0);
            pets.forEach(pet => {
                expect(pet).toBeDefined();
                expect(pet.owner).toBeDefined();
                expect(pet.owner).toEqual(jenny);
            });
            expect(jenny.pets.length).toEqual(4);
            jenny.pets.forEach(pet => {
                pet.owner = christy;
            });
            expect(jenny.pets.length).toEqual(0);
            pets.forEach(pet => {
                expect(pet).toBeDefined();
                expect(pet.owner).toBeDefined();
                expect(pet.owner).toEqual(christy);
            });
            expect(christy.pets.length).toEqual(4);
            done();
        });
    });
    it('Navigation collection properties edit', done => {
        withLocalPetsModel((pets, owners, jenny, christy) => {
            christy.pets.splice(0, christy.pets.length);
            expect(christy.pets.length).toEqual(0);
            pets.forEach(pet => {
                expect(pet).toBeDefined();
                expect(pet.owner === null || pet.owner === jenny).toBeTruthy();
                if (!pet.owner) {
                    jenny.pets.push(pet);
                }
            });
            expect(jenny.pets.length).toEqual(4);
            done();
        });
    });
});