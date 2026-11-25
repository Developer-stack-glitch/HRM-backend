const mysql = require("mysql2/promise");
require("dotenv").config();

const IST_TIMEZONE = "+05:30";

/**
 * Cast MySQL TIMESTAMP values (returned in session IST) to ISO-8601 strings
 * with explicit +05:30 offset so clients never misparse them as UTC or local.
 */
const formatTimestampField = (field, next) => {
    if (field.type === "TIMESTAMP") {
        const val = field.string();
        if (!val) return val;
        return val.includes("T") ? val : `${val.replace(" ", "T")}${IST_TIMEZONE}`;
    }
    return next();
};

const configurePool = (targetPool) => {
    targetPool.on("connection", (connection) => {
        connection.query(`SET time_zone = '${IST_TIMEZONE}'`);
    });
    return targetPool;
};

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectTimeout: 60000,
    queueLimit: 0,
    dateStrings: true,
    typeCast: formatTimestampField,
};

const pool = configurePool(mysql.createPool(config));

const tenantPools = new Map();

const getTenantPool = (dbName) => {
    if (!dbName || dbName === process.env.DB_NAME) {
        return pool;
    }
    if (!tenantPools.has(dbName)) {
        tenantPools.set(dbName, configurePool(mysql.createPool({
            ...config,
            database: dbName
        })));
    }
    return tenantPools.get(dbName);
};

module.exports = {
    pool,
    getTenantPool,
    config,
    formatTimestampField
};