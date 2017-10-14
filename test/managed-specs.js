/* global expect */

import Id from 'septima-utils/id';
import M from '../src/managed';

describe('Managed Objects', () => {
    it('ManageObject.1', () => {
        const owner = {id: Id.generate(), name: 'Christy'};
        let changes = 0;
        let beforeChanges = 0;
        M.manageObject(owner, () => {
            changes++;
        }, () => {
            beforeChanges++;
        });

        owner.name += '33';
        expect(changes).toEqual(1);
        expect(beforeChanges).toEqual(1);

        M.unmanageObject(owner);
        owner.name += '4';
        expect(changes).toEqual(1);
        expect(beforeChanges).toEqual(1);
    });
    it('ManageObject.2', () => {
        const owner = {id: Id.generate(), name: 'Christy'};
        let changes = 0;
        let beforeChanges = 0;
        const unmanage = M.manageObject(owner, () => {
            changes++;
        }, () => {
            beforeChanges++;
        });

        owner.name += '33';
        expect(changes).toEqual(1);
        expect(beforeChanges).toEqual(1);

        unmanage();
        owner.name += '4';
        expect(changes).toEqual(1);
        expect(beforeChanges).toEqual(1);
    });
    it('Listenable.1', () => {
        const owner = {id: Id.generate(), name: 'Christy'};
        let changes = 0;
        M.listenable(owner);
        M.listen(owner, () => {
            changes++;
        });

        const oldName = owner.name;
        owner.name += '33';
        M.fire(owner, {
            source: owner,
            propertyName: 'name',
            oldValue: oldName,
            newValue: owner.name
        });
        expect(changes).toEqual(1);

        M.unlisten(owner);
        M.unlistenable(owner);
        owner.name += '4';
        expect(changes).toEqual(1);
    });
    it('Listenable.2', () => {
        const owner = {id: Id.generate(), name: 'Christy'};
        let changes = 0;
        const unlistenable = M.listenable(owner);
        const unlisten = M.listen(owner, () => {
            changes++;
        });

        const oldName = owner.name;
        owner.name += '33';
        M.fire(owner, {
            source: owner,
            propertyName: 'name',
            oldValue: oldName,
            newValue: owner.name
        });
        expect(changes).toEqual(1);

        unlisten();
        unlistenable();
        owner.name += '4';
        expect(changes).toEqual(1);
    });

    const samples = [
        {id: Id.generate(), name: 'Bob'},
        {id: Id.generate(), name: 'Rob'},
        {id: Id.generate(), name: 'Til'},
        {id: Id.generate(), name: 'Sven'},
        {id: Id.generate(), name: 'Kitana'}
    ];
    it('ManagedArray.push|pop', () => {
        const data = samples.slice(0, samples.length);
        M.manageArray(data, (added, removed) => {
        });
        data.push(
                {id: Id.generate(), name: 'Christy'},
                {id: Id.generate(), name: 'Jane'}
        );
        expect(data.length).toEqual(samples.length + 2);
        data.pop();
        expect(data.length).toEqual(samples.length + 1);
        data.pop();
        expect(data.length).toEqual(samples.length);
    });
    it('ManagedArray.unshift|shift', () => {
        const data = samples.slice(0, samples.length);
        M.manageArray(data, (added, removed) => {
        });
        data.unshift(
                {id: Id.generate(), name: 'Christy'},
                {id: Id.generate(), name: 'Jane'}
        );
        expect(data.length).toEqual(samples.length + 2);
        data.shift();
        expect(data.length).toEqual(samples.length + 1);
        data.shift();
        expect(data.length).toEqual(samples.length);
    });
    it('ManagedArray.reverse', () => {
        const data = samples.slice(0, samples.length);
        M.manageArray(data, (added, removed) => {
        });
        expect(data[0].name).toEqual(samples[0].name);
        expect(data[1].name).toEqual(samples[1].name);
        const reversed = data.reverse();
        expect(reversed[0].name).toEqual(samples[samples.length - 1].name);
        expect(reversed[reversed.length - 1].name).toEqual(samples[0].name);
        expect(reversed).toBe(data);
    });
    it('ManagedArray.sort', () => {
        const data = samples.slice(0, samples.length);
        M.manageArray(data, (added, removed) => {
        });
        expect(data[0].name).toEqual(samples[0].name);
        expect(data[1].name).toEqual(samples[1].name);
        const sorted = data.sort((o1, o2) => {
            return o1.name > o2.name;
        });
        expect(sorted
                .map((item) => {
                    return item.name;
                }))
                .toEqual([
                    'Bob',
                    'Kitana',
                    'Rob',
                    'Sven',
                    'Til'
                ]);
        expect(sorted).toBe(data);
    });

    it('ManagedArray.splice', () => {
        const data = samples.slice(0, samples.length);
        M.manageArray(data, (added, removed) => {
        });
        expect(data).toEqual(samples);
        const deleted = data.splice(0, data.length);
        expect(deleted).toEqual(samples);
        const deleted1 = data.splice(0, 0, ...deleted);
        expect(deleted1.length).toEqual(0);
        expect(data).toEqual(samples);
        const deleted2 = data.splice(0, 1, {id: Id.generate(), name: 'Bob-Next'});
        expect(deleted2.length).toEqual(1);
        expect(deleted2[0].name).toEqual('Bob');
        expect(data[0].name).toEqual('Bob-Next');
    });
});