/* global expect, spyOn, Promise */

import Id from 'septima-utils/id';
import Invoke from 'septima-utils/invoke';
import Resource from 'septima-remote/resource';
import Requests from 'septima-remote/requests';
import Orm from '../src/orm';
import Model from '../src/model';
import Entity from '../src/entity';
import mockSeptimaServer from './server-mock';

describe('Model Orm and orderers. ', () => {
    beforeAll(() => {
        mockSeptimaServer();
    });
    afterAll(() => {
        XMLHttpRequest.restore();
    });

    it('Creation Api', () => {
        const model = new Model();
        const entity = new Entity();
        expect(model).toBeDefined();
        expect(model instanceof Model).toBeTruthy();
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
        const request = new Requests.Cancelable();
        Orm.requireEntities(['pets', 'all-owners'], request)
                .then(([petsEntity, ownersEntity]) => {
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
                })
                .catch(done.fail);
        expect(request.cancel).toBeDefined();
    });
    it('requireEntities.failure.1', done => {
        const request = new Requests.Cancelable();
        Orm.requireEntities(['absent-entity'], request)
                .then(() => {
                    done.fail("'Orm.requireEntities' against absent entity should lead to an error");
                })
                .catch(e => {
                    expect(e).toBeDefined();
                    done();
                });
        expect(request.cancel).toBeDefined();
    });
    it('requireEntities.failure.2', done => {
        const request = new Requests.Cancelable();
        Orm.requireEntities('fake-pets', request)
                .then(() => {
                    done.fail("'Orm.requireEntities' after cancelation should lead to an error");
                })
                .catch(e => {
                    expect(e).toBeDefined();
                    done();
                });
        expect(request.cancel).toBeDefined();
        request.cancel();
    });

    function remotePetsModel(manager) {
        return Resource.loadText('base/assets/entities/model-graph.model', manager)
                .then(loaded => {
                    const model = Orm.readModel(loaded);
                    model.owners.keysNames.add('owners_id');
                    return model;
                });
    }

    it("'Entity.requery()' -> Some changes -> 'Entity.revert()'", done => {
        remotePetsModel()
                .then((model) => {
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then((model) => {
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
                })
                .catch(done.fail);
    });
    it('Requery graph', done => {
        let ownersRequeried = 0;
        let petsOfOwnerRequeried = 0;
        let petOfOwnerRequeried = 0;
        remotePetsModel()
                .then((model) => {
                    model.owners.onRequeried = () => {
                        ownersRequeried++;
                    };
                    model.petsOfOwner.onRequeried = () => {
                        petsOfOwnerRequeried++;
                    };
                    model.petOfOwner.onRequeried = () => {
                        petOfOwnerRequeried++;
                    };
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(() => {
                    Invoke.later(() => {
                        expect(ownersRequeried).toEqual(1);
                        expect(petsOfOwnerRequeried).toEqual(1);
                        expect(petOfOwnerRequeried).toEqual(1);
                        done();
                    });
                })
                .catch(done.fail);
    });
    it("Requery partial graph with 'Entity.requery() with dependents'", done => {
        let ownersRequeried = 0;
        let petsOfOwnerRequeried = 0;
        let petOfOwnerRequeried = 0;
        remotePetsModel()
                .then((model) => {
                    model.owners.onRequeried = () => {
                        ownersRequeried++;
                    };
                    model.petsOfOwner.onRequeried = () => {
                        petsOfOwnerRequeried++;
                    };
                    model.petOfOwner.onRequeried = () => {
                        petOfOwnerRequeried++;
                    };
                    const request = new Requests.Cancelable();
                    const result = model.owners.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(() => {
                    Invoke.later(() => {
                        expect(ownersRequeried).toEqual(1);
                        expect(petsOfOwnerRequeried).toEqual(1);
                        expect(petOfOwnerRequeried).toEqual(1);
                        done();
                    });
                })
                .catch(done.fail);
    });
    it("Requery graph after 'Model.cancel()' after one entity requeried", done => {
        let ownersRequeried = 0;
        let petsOfOwnerRequeried = 0;
        let petOfOwnerRequeried = 0;
        let petsModel;

        const modelRequest = new Requests.Cancelable();
        remotePetsModel(modelRequest)
                .then((model) => {
                    petsModel = model;
                    const dataRequest = new Requests.Cancelable();
                    model.owners.onRequeried = () => {
                        ownersRequeried++;
                        dataRequest.cancel();
                    };
                    model.petsOfOwner.onRequeried = () => {
                        petsOfOwnerRequeried++;
                    };
                    model.petOfOwner.onRequeried = () => {
                        petOfOwnerRequeried++;
                    };
                    const result = model.requery(dataRequest);
                    expect(dataRequest.cancel).toBeDefined();
                    return result;
                })
                .then((model) => {
                    done.fail("'then' of requery promise shouldn't be called after 'Model.cancel()'");
                })
                .catch(reason => {
                    expect(reason).toBeDefined();
                    expect(ownersRequeried).toEqual(1);
                    expect(petsModel.owners.length).toBeGreaterThan(0);
                    expect(petsOfOwnerRequeried).toEqual(0);
                    expect(petsModel.petsOfOwner.length).toEqual(0);
                    expect(petOfOwnerRequeried).toEqual(0);
                    expect(petsModel.petOfOwner.length).toEqual(0);
                    done();
                });
        expect(modelRequest.cancel).toBeDefined();
    });
    it("Requery graph after 'Model.cancel()'.immediate", done => {
        let ownersRequeried = 0;
        let petsOfOwnerRequeried = 0;
        let petOfOwnerRequeried = 0;
        let petsModel;
        remotePetsModel()
                .then((model) => {
                    petsModel = model;
                    model.owners.onRequeried = () => {
                        ownersRequeried++;
                    };
                    model.petsOfOwner.onRequeried = () => {
                        petsOfOwnerRequeried++;
                    };
                    model.petOfOwner.onRequeried = () => {
                        petOfOwnerRequeried++;
                    };
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    request.cancel();
                    return result;
                })
                .then(() => {
                    done.fail("Success callback of requery shouldn't be called after 'Model|cancel()'");
                })
                .catch(reason => {
                    expect(reason).toBeDefined();
                    expect(ownersRequeried).toEqual(0);
                    expect(petsModel.owners.length).toEqual(0);
                    expect(petsOfOwnerRequeried).toEqual(0);
                    expect(petsModel.petsOfOwner.length).toEqual(0);
                    expect(petOfOwnerRequeried).toEqual(0);
                    expect(petsModel.petOfOwner.length).toEqual(0);
                    done();
                });
    });
    it("Entities' events", done => {
        let onRequiredCalled = 0;
        let onChangeCalled = 0;
        let onInsertCalled = 0;
        let onDeleteCalled = 0;
        let petsModel;
        remotePetsModel()
                .then((model) => {
                    petsModel = model;
                    model.owners.onRequeried = () => {
                        onRequiredCalled++;
                    };
                    model.owners.onChange = event => {
                        onChangeCalled++;
                        expect(event).toBeDefined();
                        expect(event.source).toBeDefined();
                        expect(event.propertyName).toBeDefined();
                        expect(event.oldValue).toBeDefined();
                        expect(event.newValue).toBeDefined();
                    };
                    model.owners.onInsert = event => {
                        onInsertCalled++;
                        expect(event).toBeDefined();
                        expect(event.source).toBeDefined();
                        expect(event.items).toBeDefined();
                    };
                    model.owners.onDelete = event => {
                        onDeleteCalled++;
                        expect(event).toBeDefined();
                        expect(event.source).toBeDefined();
                        expect(event.items).toBeDefined();
                    };
                    expect(model.owners.onRequery === model.owners.onRequeried).toBeTruthy();
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(() => {
                    expect(onRequiredCalled).toEqual(1);
                    const newOwner = {
                        // Note! Only changes of those properties, that are in push/splice/unshift will be observable
                        // for changeLog and for onChange events!
                        owners_id: Id.generate(),
                        firstname: 'test-owner'
                    };
                    petsModel.owners.push(newOwner);
                    newOwner.firstname = 'test-owner-edited';
                    petsModel.owners.remove(newOwner);
                    Invoke.later(() => {
                        expect(onInsertCalled).toEqual(1);
                        expect(onChangeCalled).toEqual(1);
                        expect(onDeleteCalled).toEqual(1);
                        done();
                    });
                })
                .catch(done.fail);
    });
    it('Requery of model with command driven entities', done => {
        remotePetsModel()
                .then((model) => {
                    model.addEntity(new Entity('add-pet'));
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(() => {
                    done.fail("'model.requery()' with command like entity inside, should lead to an error");
                })
                .catch(reason => {
                    expect(reason).toBeDefined();
                    done();
                });
    });

    it('Extra and unknown to a backend properties', done => {
        remotePetsModel()
                .then((model) => {
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then((model) => {
                    model.owners[0].name += '-edited by test';
                    const testOwner = {
                        owners_id: Id.generate(),
                        unknownproperty: 'should not be considered while translating within a backend.'
                    };
                    model.owners.push(testOwner);
                    return model.save();
                })
                .then(result => {
                    expect(result).toBeDefined();
                    expect(result).toBeGreaterThanOrEqual(1);
                    done();
                })
                .catch(done.fail);
    });
    it("'Entity.query()' -> 'Entity.append()' chain", done => {
        let petsModel;
        remotePetsModel()
                .then(model => {
                    petsModel = model;
                    const request = new Requests.Cancelable();
                    const result = model.owners.query({}, request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(owners => {
                    expect(owners).toBeDefined();
                    expect(owners.length).toBeDefined();
                    expect(owners.length).toBeGreaterThan(1);
                    expect(petsModel.owners.length).toEqual(0);
                    petsModel.owners.append(owners);
                    expect(petsModel.owners.length).toBeGreaterThan(1);
                    done();
                })
                .catch(done.fail);
    });
    it("'Entity.update()'.params in order", done => {
        remotePetsModel()
                .then((model) => {
                    const addPet = new Entity('add-pet');
                    model.addEntity(addPet);
                    const request = new Requests.Cancelable();
                    const result = addPet.update({
                        id: Id.generate(),
                        ownerId: 142841834950629,
                        typeId: 142841300122653,
                        name: 'test-pet-1'
                    }, request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(result => {
                    expect(result).toBeDefined();
                    done();
                })
                .catch(done.fail);
    });
    it("'Entity.update()'.params out of order", done => {
        remotePetsModel()
                .then((model) => {
                    const addPet = new Entity('add-pet');
                    model.addEntity(addPet);
                    const request = new Requests.Cancelable();
                    const result = addPet.update({
                        id: Id.generate(),
                        typeId: 142841300122653,
                        ownerId: 142841834950629,
                        name: 'test-pet-2'
                    }, request);
                    expect(request.cancel).toBeDefined();
                    return  result;
                })
                .then(result => {
                    expect(result).toBeDefined();
                    done();
                })
                .catch(done.fail);
    });
    it("'Entity.enqueueUpdate()'", done => {
        remotePetsModel()
                .then((model) => {
                    const addPet = new Entity('add-pet');
                    model.addEntity(addPet);
                    addPet.enqueueUpdate({
                        id: Id.generate(),
                        typeId: 142841300122653,
                        ownerId: 142841834950629,
                        name: 'test-pet-3'
                    });
                    const request = new Requests.Cancelable();
                    const result = model.save(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then(result => {
                    expect(result).toBeDefined();
                    done();
                })
                .catch(done.fail);
    });
    it("'Model.save()'", done => {
        const newOwnerId = Id.generate();
        let updatedOwnerId;
        let upatedFirstName;
        let petsModel;
        remotePetsModel()
                .then((model) => {
                    petsModel = model;
                    const request = new Requests.Cancelable();
                    const result = model.requery(request);
                    expect(request.cancel).toBeDefined();
                    return result;
                })
                .then((model) => {
                    updatedOwnerId = model.owners[0].owners_id;
                    upatedFirstName = model.owners[0].firstname + '-edited by test';
                    model.owners[0].firstname = upatedFirstName;
                    const testOwner = {
                        owners_id: newOwnerId,
                        firstname: 'test-owner-name',
                        lastname: `test-owner-surname-${newOwnerId}`,
                        email: 'john@doe.com'
                    };
                    model.owners.push(testOwner);
                    return model.save();
                })
                .then(result => {
                    expect(result).toBeDefined();
                    expect(result).toBeGreaterThanOrEqual(1);
                    return petsModel.requery();
                })
                .then((model) => {
                    const justUpdatedOwner = model.owners.findByKey(updatedOwnerId);
                    expect(justUpdatedOwner).toBeDefined();
                    expect(justUpdatedOwner.firstname).toEqual(upatedFirstName);

                    const justAddedOwner = model.owners.findByKey(newOwnerId);
                    expect(justAddedOwner).toBeDefined();
                    expect(justAddedOwner.lastname).toEqual(`test-owner-surname-${newOwnerId}`);
                    done();
                })
                .catch(done.fail);
    });

    function localPetsModel() {
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
        return Promise.resolve([pets, owners, jenny, christy]);
    }

    it('Navigation properties view', done => {
        localPetsModel()
                .then(([pets, owners, jenny, christy]) => {
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
                })
                .catch(done.fail);
    });
    it('Navigation scalar properties edit', done => {
        localPetsModel()
                .then(([pets, owners, jenny, christy]) => {
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
                })
                .catch(done.fail);
    });
    it('Navigation collection properties edit', done => {
        localPetsModel()
                .then(([pets, owners, jenny, christy]) => {
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
                })
                .catch(done.fail);
    });
    it('findBy criteria', done => {
        localPetsModel()
                .then(([pets, owners, jenny, christy]) => {
                    const found = owners.findBy({name: christy.name, id: christy.id});
                    expect(found).toBeDefined();
                    expect(found.length).toEqual(1);
                    expect(found[0]).toBe(christy);
                    done();
                })
                .catch(done.fail);
    });
});