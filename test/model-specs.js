/* global expect, spyOn, Promise */

import Id from 'septima-utils/id';
import Requests from 'septima-remote/requests';
import Model from '../src/model';
import Entity from '../src/entity';

import mockSeptimaServer from './server-mock';

describe('Model, entities and orderers. ', () => {
    beforeAll(() => {
        mockSeptimaServer();
    });
    afterAll(() => {
        XMLHttpRequest.restore();
    });

    it('Creation Api', done => {
        const model = new Model();
        const entity = new Entity(model, 'dummy', 'dummy_id');
        expect(model).toBeDefined();
        expect(model instanceof Model).toBeTruthy();
        expect(entity).toBeDefined();
        expect(entity instanceof Entity).toBeTruthy();
        try {
            new Entity();
            done.fail('First argument is required')
        } catch (e) {
            try {
                new Entity(model);
                done.fail('Second argument is required')
            } catch (e) {
                try {
                    new Entity(model, 'dummy');
                    done.fail('Third argument is required')
                } catch (e) {
                    done();
                }
            }
        }
    });

    function remotePetsModel() {
        const model = new Model();

        model.owners = new Entity(model, 'all-owners', 'owners_id');
        model.petOfOwner = new Entity(model, 'pet-of-owner', 'pets_id');
        model.petsOfOwner = new Entity(model, 'pets-of-owner', 'pets_id');

        model.petOfOwner.scalars['owner'] = {field: 'owner_id', target: model.owners};
        model.petsOfOwner.scalars['owner'] = {field: 'owner_id', target: model.owners};

        model.owners.collections['pets1'] = {source: model.petOfOwner, field: 'owner_id'};
        model.owners.collections['pets2'] = {source: model.petsOfOwner, field: 'owner_id'};

        return model;
    }

    it("'Entity.query()' -> Some changes -> 'Model.dropChanges()'", done => {
        const model = remotePetsModel()
        const request = new Requests.Cancelable();
        const result = model.owners.query({}, request);
        expect(request.cancel).toBeDefined();
        result
            .then(owners => {
                const oldLength = owners.length;
                expect(oldLength).toBeGreaterThan(1);
                expect(model.changeLog).toBeDefined();
                expect(model.changeLog.length).toBeDefined();
                expect(model.changeLog.length).toEqual(0);
                owners[0].firstname += Id.next();
                expect(model.changeLog.length).toEqual(1);
                owners.push({
                    owners_id: Id.next()
                });
                expect(model.changeLog.length).toEqual(2);
                model.dropChanges();
                expect(model.changeLog.length).toEqual(0);
                done();
            })
            .catch(done.fail);
    });
    it('Query of command-driven entity', done => {
        const model = remotePetsModel()
        model.addPet = new Entity(model, 'add-pet', 'pets_id');
        const request = new Requests.Cancelable();
        const result = model.addPet.query({}, request);
        expect(request.cancel).toBeDefined();
        result
            .then(() => {
                done.fail("'Entity.query()' with command like entity inside, should lead to an error");
            })
            .catch(reason => {
                expect(reason).toBeDefined();
                done();
            });
    });

    it('Extra and unknown to a backend properties', done => {
        const model = remotePetsModel()
        const request = new Requests.Cancelable();
        const result = model.owners.query({}, request);
        expect(request.cancel).toBeDefined();
        result
            .then(owners => {
                owners[0].name += '-edited by test';
                const testOwner = {
                    owners_id: Id.next(),
                    unknownproperty: 'should not be considered while translating within a backend.'
                };
                owners.push(testOwner);
                return model.save();
            })
            .then(result => {
                expect(result).toBeDefined();
                expect(result).toEqual(2);
                done();
            })
            .catch(done.fail);
    });
    it("'Entity.update()'", done => {
        const model = remotePetsModel()
        const addPet = new Entity(model, 'add-pet', 'id');
        const request = new Requests.Cancelable();
        const result = addPet.update({
            id: Id.next(),
            name: 'test-pet-1',
            typeId: 142841300122653,
            ownerId: 142841834950629
        }, request);
        expect(request.cancel).toBeDefined();
        result
            .then(affected => {
                expect(affected).toEqual(1);
                done();
            })
            .catch(done.fail);
    });
    it("'Entity.enqueueUpdate()'", done => {
        const model = remotePetsModel()
        const addPet = new Entity(model, 'add-pet', 'id');
        addPet.enqueueUpdate({
            id: Id.next(),
            typeId: 142841300122653,
            ownerId: 142841834950629,
            name: 'test-pet-3'
        });
        const request = new Requests.Cancelable();
        const result = model.save(request);
        expect(request.cancel).toBeDefined();
        result
            .then(affected => {
                expect(affected).toEqual(1);
                done();
            })
            .catch(done.fail);
    });
    it("'Model.save()'", done => {
        const newOwnerId = Id.next();
        let updatedOwnerId;
        let upatedFirstName;
        const model = remotePetsModel();
        const request = new Requests.Cancelable();
        const result = model.owners.query({}, request);
        expect(request.cancel).toBeDefined();
        return result
            .then(owners => {
                updatedOwnerId = owners[0].owners_id;
                upatedFirstName = owners[0].firstname + '-edited by test';
                owners[0].firstname = upatedFirstName;
                const testOwner = {
                    owners_id: newOwnerId,
                    firstname: 'test-owner-name',
                    lastname: `test-owner-surname-${newOwnerId}`,
                    email: 'john@doe.com'
                };
                owners.push(testOwner);
                return model.save();
            })
            .then(affected => {
                expect(affected).toBeDefined();
                expect(affected).toEqual(2);
                return model.owners.query({});
            })
            .then(owners => {
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
        const model = new Model();

        model.pets = new Entity(model, 'pets', 'id');
        model.owners = new Entity(model, 'owners', 'id');

        model.pets.scalars['owner'] = {field: 'owner_id', target: model.owners};
        model.owners.collections['pets'] = {source: model.pets, field: 'owner_id'};

        const christy = {id: Id.next(), name: 'Christy'};
        const jenny = {id: Id.next(), name: 'Jenny'};

        const owners = model.owners.wrapData([]);
        owners.push(
            christy,
            jenny
        );

        const pets = model.pets.wrapData([]);
        pets.push(
            {id: Id.next(), name: 'Spike', owner_id: christy.id},
            {id: Id.next(), name: 'Pick', owner_id: jenny.id},
            {id: Id.next(), name: 'Tom', owner_id: jenny.id},
            {id: Id.next(), name: 'Jerry', owner_id: christy.id}
        );
        return [model, pets, owners, model.owners.findByKey(jenny.id), model.owners.findByKey(christy.id)];
    }

    it('Navigation properties view', done => {
        const [model, pets, owners, jenny, christy] = localPetsModel();
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
    it('Navigation scalar properties edit', done => {
        const [model, pets, owners, jenny, christy] = localPetsModel();
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
    it('Entity.findBy()', done => {
        const [model, pets, owners, jenny, christy] = localPetsModel();
        const found = model.owners.findBy({name: christy.name, id: christy.id});
        expect(found).toBeDefined();
        expect(found.length).toEqual(1);
        expect(found[0]).toBe(christy);
        done();
    });
});