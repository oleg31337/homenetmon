class appLogger {
    constructor() {
      this.tzoffset = new Date().getTimezoneOffset() * 60000; // offset in milliseconds
    }
  
    log(...theArgs) {
      const localISOTime = new Date(Date.now() - this.tzoffset).toISOString().slice(0, -1);
      console.log(`${localISOTime} [LOG]`, theArgs);
    }
  
    debug(...theArgs) {
      if (process.env.DEBUG === 'true') {
        const localISOTime = new Date(Date.now() - this.tzoffset).toISOString().slice(0, -1);
        console.log(`${localISOTime} [DEBUG]`, theArgs);
      }
    }
  
    error(...theArgs) {
      const localISOTime = new Date(Date.now() - this.tzoffset).toISOString().slice(0, -1);
      console.error(`${localISOTime} [ERROR]`, theArgs);
    }
  } 
export default appLogger;