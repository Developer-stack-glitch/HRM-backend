const mysql = require("mysql2/promise");
require("dotenv").config();

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectTimeout: 60000,
    queueLimit: 0,
    dateStrings: true,
};

const pool = mysql.createPool(config);

const tenantPools = new Map();

const getTenantPool = (dbName) => {
    if (!dbName || dbName === process.env.DB_NAME) {
        return pool;
    }
    if (!tenantPools.has(dbName)) {
        tenantPools.set(dbName, mysql.createPool({
            ...config,
            database: dbName
        }));
    }
    return tenantPools.get(dbName);
};

module.exports = {
    pool,
    getTenantPool,
    config
};