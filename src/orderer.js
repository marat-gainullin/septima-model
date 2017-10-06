class Orderer {
    constructor(aKeysNames) {
        const keyNames = aKeysNames.sort();

        function calcKey(anObject) {
            let key = '';
            keyNames.forEach(aKeyName => {
                const datum = anObject[aKeyName];
                if (key.length > 0)
                    key += ' | ';
                key += datum instanceof Date ? JSON.stringify(datum) : (`${datum}`);
            });
            return key;
        }

        this.inKeys = aKeyName => keyNames.includes(aKeyName);

        const map = new Map();
        this.add = anObject => {
            const key = calcKey(anObject);
            let subset = map.get(key);
            if (!subset) {
                subset = new Set();
                map.set(key, subset);
            }
            subset.add(anObject);
        };
        this.delete = anObject => {
            const key = calcKey(anObject);
            const subset = map.get(key);
            if (subset) {
                subset.delete(anObject);
                if (subset.size === 0) {
                    map.delete(key);
                }
            }
        };
        this.find = aCriteria => {
            const key = calcKey(aCriteria);
            const subset = map.get(key);
            if (!subset) {
                return [];
            } else {
                return Array.from(subset);
            }
        };
    }
}
export default Orderer;