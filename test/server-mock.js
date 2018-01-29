import Sinon from 'sinon';
import Invoke from 'septima-utils/invoke';
import Requests from 'septima-remote/requests';

export default () => {
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
        return url.includes('data/') || url.includes('commit');
    }

    let xhrSpy = Sinon.useFakeXMLHttpRequest();
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
                if (xhr.url.endsWith('schema/pets')) {
                    respondObj(xhr, [
                            {name: 'pets_id', description: 'Pet primary key', type: 'Number', pk: true, nullable: false},
                            {name: 'type_id', description: "Pet's type reference", type: 'Number', nullable: false},
                            {name: 'owner_id', description: 'Owner reference field', type: 'Number', nullable: false},
                            {name: 'name', description: "Pet's name", type: 'String', nullable: false},
                            {name: 'birthdate', description: "Pet's bith date", type: 'Date', nullable: true}
                        ]);
                } else if (xhr.url.endsWith('schema/fake-pets')) {
                    respondObj(xhr, []);
                } else if (xhr.url.endsWith('schema/all-owners')) {
                    respondObj(xhr, [
                            {name: 'owners_id', description: 'Owner primary key', type: 'Number', pk: true, nullable: false},
                            {name: 'firstname', description: "Owner's first name", type: 'String', nullable: false},
                            {name: 'lastname', description: "Owner's last name", type: 'String', nullable: true},
                            {name: 'address', description: "Owner's address", type: 'String', nullable: true},
                            {name: 'city', description: "Owner's city", type: 'String', nullable: true},
                            {name: 'telephone', description: "Owner's phone number", type: 'String', nullable: true},
                            {name: 'email', description: "Owner's email", type: 'String', nullable: true}
                        ]);
                } else if (xhr.url.endsWith('data/pets')) {
                    respondObj(xhr, petsData);
                } else if (xhr.url.includes('data/pets-of-owner')) {
                    const ownerKey = xhr.url.match(/ownerKey=([\dnul]+)/)[1];
                    respondObj(xhr, petsData.filter((pet) => {
                        return pet.owner_id == ownerKey;
                    }));
                } else if (xhr.url.includes('data/pet-of-owner')) {
                    const ownerKey = xhr.url.match(/ownerKey=([\dnul]+)/)[1];
                    const petKey = xhr.url.match(/petKey=([\dnul]+)/)[1];
                    respondObj(xhr, petsData.filter((pet) => {
                        return pet.owner_id == ownerKey && pet.pets_id == petKey;
                    }));
                } else if (xhr.url.endsWith('data/all-owners')) {
                    respondObj(xhr, ownersData);
                } else if (xhr.url.endsWith('data/add-pet')) {
                    xhr.respond(404, {"Content-Type": "application/json"},
                        JSON.stringify({error: "Collection 'add-pet' is not found"}));
                } else if (xhr.url.endsWith('commit')) {
                    if (xhr.readyState !== 0) {
                        const log = JSON.parse(xhr.requestBody);
                        let affected = 0;
                        log.forEach((item) => {
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
};