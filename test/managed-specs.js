/* global expect */

import Id from 'septima-utils/id';
import M from '../src/managed';

describe('Managed Objects', () => {
    it('Listenable.1', () => {
        const owner = new Proxy({id: Id.next(), name: 'Christy'}, M.manageObject());
        let beforeChanges = 0;
        let changes = 0;
        const listener = {
            beforeChange: () => {
                beforeChanges++;
            },
            change: () => {
                changes++;
            }
        };
        M.listen(owner, listener);

        const oldName = owner.name;
        owner.name += '33';
        M.fire(owner, {
            source: owner,
            propertyName: 'name',
            oldValue: oldName,
            newValue: owner.name
        });
        expect(beforeChanges).toEqual(1);
        expect(changes).toEqual(2);

        M.unlisten(owner, listener);
        owner.name += '4';
        expect(changes).toEqual(2);
    });
    it('Listenable.2', () => {
        const owner = new Proxy({id: Id.next(), name: 'Christy'}, M.manageObject());
        let beforeChanges = 0;
        let changes = 0;
        const unlisten = M.listen(owner, {
            beforeChange: () => {
                beforeChanges++;
            },
            change: () => {
                changes++;
            }
        });

        const oldName = owner.name;
        owner.name += '33';
        M.fire(owner, {
            source: owner,
            propertyName: 'name',
            oldValue: oldName,
            newValue: owner.name
        });
        expect(beforeChanges).toEqual(1);
        expect(changes).toEqual(2);

        unlisten();
        owner.name += '4';
        expect(changes).toEqual(2);
    });

    const samples = [
        {id: Id.next(), name: 'Bob'},
        {id: Id.next(), name: 'Rob'},
        {id: Id.next(), name: 'Til'},
        {id: Id.next(), name: 'Sven'},
        {id: Id.next(), name: 'Kitana'}
    ];
    it('ManagedArray.push|pop', () => {
        const data = new Proxy(samples.slice(0, samples.length), M.manageArray());
        data.push(
            {id: Id.next(), name: 'Christy'},
            {id: Id.next(), name: 'Jane'}
        );
        expect(data.length).toEqual(samples.length + 2);
        data.pop();
        expect(data.length).toEqual(samples.length + 1);
        data.pop();
        expect(data.length).toEqual(samples.length);
    });
    it('ManagedArray.unshift|shift', () => {
        const data = new Proxy(samples.slice(0, samples.length), M.manageArray());
        data.unshift(
            {id: Id.next(), name: 'Christy'},
            {id: Id.next(), name: 'Jane'}
        );
        expect(data.length).toEqual(samples.length + 2);
        data.shift();
        expect(data.length).toEqual(samples.length + 1);
        data.shift();
        expect(data.length).toEqual(samples.length);
    });
    it('ManagedArray.reverse', () => {
        const samplesCopy = samples.slice(0, samples.length);
        const data = new Proxy(samplesCopy, M.manageArray());
        expect(data[0].name).toEqual(samples[0].name);
        expect(data[1].name).toEqual(samples[1].name);
        const reversed = data.reverse();
        expect(reversed[0].name).toEqual(samples[samples.length - 1].name);
        expect(reversed[reversed.length - 1].name).toEqual(samples[0].name);
        expect(reversed).toBe(samplesCopy);
    });
    it('ManagedArray.sort', () => {
        const samplesCopy = samples.slice(0, samples.length);
        const data = new Proxy(samplesCopy, M.manageArray());
        expect(data[0].name).toEqual(samples[0].name);
        expect(data[1].name).toEqual(samples[1].name);
        const sorted = data.sort((o1, o2) => {
            return o1.name < o2.name ? -1 : o1.name > o2.name ? 1 : 0;
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
        expect(sorted).toBe(samplesCopy);
    });

    it('ManagedArray.splice', () => {
        const data = new Proxy(samples.slice(0, samples.length), M.manageArray());
        expect(data).toEqual(samples);
        const deleted = data.splice(0, data.length);
        expect(deleted).toEqual(samples);
        const deleted1 = data.splice(0, 0, ...deleted);
        expect(deleted1.length).toEqual(0);
        samples.cursor = data.cursor;
        expect(data).toEqual(samples);
        const deleted2 = data.splice(0, 1, {id: Id.next(), name: 'Bob-Next'});
        expect(deleted2.length).toEqual(1);
        expect(deleted2[0].name).toEqual('Bob');
        expect(data[0].name).toEqual('Bob-Next');
    });
});