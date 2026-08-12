class ObjectPool {
    constructor(createFn, maxSize) {
        this.pool = [];
        this.maxSize = maxSize;
        this.createFn = createFn;
        // Pre-allocate
        for(let i=0; i<maxSize; i++) {
            const obj = this.createFn();
            obj.active = false;
            this.pool.push(obj);
        }
    }

    get() {
        // Encontrar el primer inactivo
        for(let i=0; i<this.maxSize; i++) {
            if (!this.pool[i].active) {
                this.pool[i].active = true;
                return this.pool[i];
            }
        }
        return null; // Pool exhausted
    }

    forEachActive(callback) {
        for(let i=0; i<this.maxSize; i++) {
            if (this.pool[i].active) {
                callback(this.pool[i]);
            }
        }
    }
    
    getActiveCount() {
        let count = 0;
        for(let i=0; i<this.maxSize; i++) {
            if (this.pool[i].active) count++;
        }
        return count;
    }
    
    reset() {
        for(let i=0; i<this.maxSize; i++) {
            this.pool[i].active = false;
        }
    }
}
