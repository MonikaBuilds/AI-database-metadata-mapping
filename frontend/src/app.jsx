import React, { useMemo, useState } from "react";

import {
  fetchDatabaseSchema,
  giveMetadataConsent,
  getTableMapping,
  saveTableMapping,
  testDatabaseConnection,
} from "./api";

import "./App.css";

function App() {
  // =========================================================
  // DATABASE CONNECTION STATE
  // =========================================================

  const [form, setForm] = useState({
    db_type: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database_name: "",
    username: "root",
    password: "",
  });

  // =========================================================
  // CONNECTION / APPLICATION STATE
  // =========================================================

  const [connectionSuccessful, setConnectionSuccessful] =
    useState(false);

  const [consentGranted, setConsentGranted] =
    useState(false);

  const [showConsent, setShowConsent] =
    useState(false);

  const [schema, setSchema] =
    useState(null);

  const [selectedTable, setSelectedTable] =
    useState(null);

  const [message, setMessage] =
    useState("");

  const [status, setStatus] =
    useState("idle");

  // =========================================================
  // BUSINESS MAPPING STATE
  // =========================================================

  const [mapping, setMapping] = useState({
    business_entity: "",
    business_description: "",
    primary_identifier: "",
    date_field: "",
    amount_field: "",
    status_field: "",
    custom_prompt: "",
  });

  const [columnMappings, setColumnMappings] =
    useState([]);

  // =========================================================
  // EMPTY MAPPING
  // =========================================================

  function getEmptyMapping() {
    return {
      business_entity: "",
      business_description: "",
      primary_identifier: "",
      date_field: "",
      amount_field: "",
      status_field: "",
      custom_prompt: "",
    };
  }

  // =========================================================
  // NORMALIZE SCHEMA RESPONSE
  // =========================================================
  //
  // Your backend currently returns:
  //
  // {
  //   success: true,
  //   metadata: {
  //     database: "metadata_test",
  //     tables: [
  //       {
  //         name: "customers",
  //         columns: [...]
  //       }
  //     ]
  //   }
  // }
  //
  // Frontend internally uses:
  //
  // schema.database_name
  // table.table_name
  // schema.relationships
  //
  // This function converts backend format into
  // one consistent frontend format.
  // =========================================================

  function normalizeSchemaResponse(result) {
    const raw =
      result?.metadata ||
      result?.data?.metadata ||
      result?.data ||
      result ||
      {};

    const rawTables =
      Array.isArray(raw?.tables)
        ? raw.tables
        : [];

    const tables = rawTables.map(
      (table, tableIndex) => {
        const tableName =
          table?.table_name ||
          table?.name ||
          table?.table ||
          table?.TABLE_NAME ||
          `table_${tableIndex + 1}`;

        const rawColumns =
          Array.isArray(table?.columns)
            ? table.columns
            : [];

        const columns = rawColumns.map(
          (column, columnIndex) => {
            const nullable =
              typeof column?.nullable === "boolean"
                ? column.nullable
                : column?.IS_NULLABLE === "YES";

            const isPrimaryKey =
              Boolean(
                column?.is_primary_key ||
                  column?.primary_key ||
                  column?.COLUMN_KEY === "PRI"
              );

            const referencedTable =
              column?.referenced_table ||
              column?.target_table ||
              column?.REFERENCED_TABLE_NAME ||
              null;

            const referencedColumn =
              column?.referenced_column ||
              column?.target_column ||
              column?.REFERENCED_COLUMN_NAME ||
              null;

            const isForeignKey =
              Boolean(
                column?.is_foreign_key ||
                  column?.foreign_key ||
                  referencedTable
              );

            return {
              ...column,

              name:
                column?.name ||
                column?.column_name ||
                column?.COLUMN_NAME ||
                `column_${columnIndex + 1}`,

              data_type:
                column?.data_type ||
                column?.type ||
                column?.DATA_TYPE ||
                "unknown",

              nullable,

              is_primary_key:
                isPrimaryKey,

              is_foreign_key:
                isForeignKey,

              referenced_table:
                referencedTable,

              referenced_column:
                referencedColumn,
            };
          }
        );

        return {
          ...table,

          table_name:
            tableName,

          columns,
        };
      }
    );

    // =======================================================
    // NORMALIZE RELATIONSHIPS
    // =======================================================

    let relationships =
      raw?.relationships ||
      raw?.relations ||
      [];

    if (!Array.isArray(relationships)) {
      relationships = [];
    }

    relationships =
      relationships.map(
        (relationship, index) => ({
          ...relationship,

          source_table:
            relationship?.source_table ||
            relationship?.from_table ||
            "",

          source_column:
            relationship?.source_column ||
            relationship?.from_column ||
            "",

          target_table:
            relationship?.target_table ||
            relationship?.to_table ||
            "",

          target_column:
            relationship?.target_column ||
            relationship?.to_column ||
            "",

          constraint_name:
            relationship?.constraint_name ||
            relationship?.name ||
            `relationship_${index + 1}`,
        })
      );

    // =======================================================
    // FALLBACK RELATIONSHIP GENERATION
    // =======================================================
    //
    // If backend doesn't send relationships but sends
    // referenced_table / referenced_column on FK columns,
    // generate relationships here.
    // =======================================================

    if (relationships.length === 0) {
      const derivedRelationships = [];

      tables.forEach((table) => {
        table.columns.forEach((column) => {
          if (
            column.is_foreign_key &&
            column.referenced_table &&
            column.referenced_column
          ) {
            derivedRelationships.push({
              source_table:
                table.table_name,

              source_column:
                column.name,

              target_table:
                column.referenced_table,

              target_column:
                column.referenced_column,

              constraint_name:
                `${table.table_name}_${column.name}_fk`,
            });
          }
        });
      });

      relationships =
        derivedRelationships;
    }

    return {
      db_type:
        raw?.db_type ||
        form.db_type,

      database_name:
        raw?.database_name ||
        raw?.database ||
        form.database_name,

      tables,

      relationships,
    };
  }

  // =========================================================
  // DASHBOARD COUNTS
  // =========================================================

  const tableCount =
    schema?.tables?.length ?? 0;

  const columnCount =
    useMemo(() => {
      if (!schema?.tables) {
        return 0;
      }

      return schema.tables.reduce(
        (total, table) =>
          total +
          (table?.columns?.length || 0),
        0
      );
    }, [schema]);

  const relationshipCount =
    schema?.relationships?.length ?? 0;

  // =========================================================
  // SELECTED TABLE RELATIONSHIPS
  // =========================================================

  const selectedRelationships =
    useMemo(() => {
      if (!selectedTable) {
        return [];
      }

      return (
        schema?.relationships || []
      ).filter(
        (relationship) =>
          relationship.source_table ===
            selectedTable.table_name ||
          relationship.target_table ===
            selectedTable.table_name
      );
    }, [schema, selectedTable]);

  // =========================================================
  // CONNECTION FORM CHANGE
  // =========================================================

  function handleChange(event) {
    const { name, value } =
      event.target;

    setForm((current) => ({
      ...current,

      [name]:
        name === "port"
          ? Number(value)
          : value,
    }));

    // Connection information changed.
    // Reset all previously verified state.

    setConnectionSuccessful(false);

    setConsentGranted(false);

    setShowConsent(false);

    setSchema(null);

    setSelectedTable(null);

    setColumnMappings([]);

    setMapping(
      getEmptyMapping()
    );

    setStatus("idle");

    setMessage("");
  }

  // =========================================================
  // VALIDATE CONNECTION FORM
  // =========================================================

  function validateForm() {
    if (!form.host.trim()) {
      return "Host is required.";
    }

    if (!form.database_name.trim()) {
      return "Database name is required.";
    }

    if (!form.username.trim()) {
      return "Username is required.";
    }

    if (!form.password) {
      return "Password is required.";
    }

    if (
      !form.port ||
      form.port < 1 ||
      form.port > 65535
    ) {
      return "Enter a valid port.";
    }

    return null;
  }

  // =========================================================
  // TEST DATABASE CONNECTION
  // =========================================================

  async function handleTestConnection() {
    const validationError =
      validateForm();

    if (validationError) {
      setStatus("error");

      setMessage(
        validationError
      );

      return;
    }

    setStatus("loading");

    setMessage(
      "Testing database connection..."
    );

    try {
      const result =
        await testDatabaseConnection(
          form
        );

      if (
        result?.success === false
      ) {
        throw new Error(
          result?.message ||
            result?.detail ||
            "Unable to connect to database."
        );
      }

      setConnectionSuccessful(
        true
      );

      setConsentGranted(false);

      setStatus("success");

      setMessage(
        "Database connection successful."
      );

      setShowConsent(true);
    } catch (error) {
      console.error(
        "Connection error:",
        error
      );

      setConnectionSuccessful(
        false
      );

      setConsentGranted(false);

      setShowConsent(false);

      setStatus("error");

      setMessage(
        error?.message ||
          "Database connection failed."
      );
    }
  }

  // =========================================================
  // ALLOW METADATA ACCESS
  // =========================================================

  async function handleAllowConsent() {
    setStatus("loading");

    setMessage(
      "Saving metadata access permission..."
    );

    try {
      await giveMetadataConsent(
        form.database_name
      );

      setConsentGranted(true);

      setShowConsent(false);

      setStatus("success");

      setMessage(
        "Metadata-only access permission granted."
      );
    } catch (error) {
      console.error(
        "Consent error:",
        error
      );

      setConsentGranted(false);

      setStatus("error");

      setMessage(
        error?.message ||
          "Unable to save metadata permission."
      );
    }
  }

  // =========================================================
  // CANCEL CONSENT
  // =========================================================

  function handleCancelConsent() {
    setShowConsent(false);

    setConsentGranted(false);

    setStatus("idle");

    setMessage(
      "Metadata permission was not granted."
    );
  }

  // =========================================================
  // FETCH DATABASE SCHEMA
  // =========================================================

  async function handleFetchSchema() {
    if (!connectionSuccessful) {
      setStatus("error");

      setMessage(
        "Test the database connection first."
      );

      return;
    }

    if (!consentGranted) {
      setStatus("error");

      setMessage(
        "Metadata permission is required."
      );

      setShowConsent(true);

      return;
    }

    setStatus("loading");

    setMessage(
      "Fetching database schema..."
    );

    try {
      const result =
        await fetchDatabaseSchema(
          form
        );

      console.log(
        "Raw schema response:",
        result
      );

      const normalizedSchema =
        normalizeSchemaResponse(
          result
        );

      console.log(
        "Normalized schema:",
        normalizedSchema
      );

      if (
        !Array.isArray(
          normalizedSchema.tables
        )
      ) {
        throw new Error(
          "Invalid schema response received from backend."
        );
      }

      setSchema(
        normalizedSchema
      );

      setSelectedTable(null);

      setColumnMappings([]);

      setMapping(
        getEmptyMapping()
      );

      setStatus("success");

      setMessage(
        `Schema loaded successfully: ${normalizedSchema.tables.length} tables found.`
      );
    } catch (error) {
      console.error(
        "Schema loading error:",
        error
      );

      setSchema(null);

      setSelectedTable(null);

      setColumnMappings([]);

      setStatus("error");

      setMessage(
        error?.message ||
          "Unable to fetch database schema."
      );
    }
  }

  // =========================================================
  // SELECT TABLE
  // =========================================================

  async function handleSelectTable(
    table
  ) {
    if (!table) {
      return;
    }

    const tableName =
      table.table_name ||
      table.name;

    if (!tableName) {
      setStatus("error");

      setMessage(
        "Invalid table metadata."
      );

      return;
    }

    const normalizedTable = {
      ...table,

      table_name:
        tableName,

      columns:
        Array.isArray(
          table.columns
        )
          ? table.columns
          : [],
    };

    setSelectedTable(
      normalizedTable
    );

    // =======================================================
    // CREATE DEFAULT COLUMN BUSINESS MAPPINGS
    // =======================================================

    const defaultColumnMappings =
      normalizedTable.columns.map(
        (column) => ({
          column_name:
            column.name,

          business_name: "",

          description: "",
        })
      );

    setColumnMappings(
      defaultColumnMappings
    );

    setMapping(
      getEmptyMapping()
    );

    setStatus("idle");

    setMessage(
      `Selected table: ${tableName}`
    );

    // =======================================================
    // TRY LOADING SAVED MAPPING
    // =======================================================

    try {
      const result =
        await getTableMapping(
          tableName,

          schema?.database_name ||
            form.database_name ||
            "default"
        );

      if (!result) {
        return;
      }

      const saved =
        result?.data ||
        result?.mapping ||
        result;

      if (
        !saved ||
        saved?.success === false
      ) {
        return;
      }

      setMapping({
        business_entity:
          saved?.business_entity ||
          "",

        business_description:
          saved?.business_description ||
          saved?.table_description ||
          "",

        primary_identifier:
          saved?.primary_identifier ||
          "",

        date_field:
          saved?.date_field ||
          "",

        amount_field:
          saved?.amount_field ||
          "",

        status_field:
          saved?.status_field ||
          "",

        custom_prompt:
          saved?.custom_prompt ||
          "",
      });

      const savedColumns =
        saved?.column_mappings ||
        saved?.columns ||
        [];

      if (
        Array.isArray(
          savedColumns
        ) &&
        savedColumns.length > 0
      ) {
        // Preserve all real DB columns even if
        // older saved mapping is incomplete.

        const mergedColumns =
          defaultColumnMappings.map(
            (defaultColumn) => {
              const savedColumn =
                savedColumns.find(
                  (item) =>
                    item.column_name ===
                    defaultColumn.column_name
                );

              return savedColumn
                ? {
                    ...defaultColumn,
                    ...savedColumn,
                  }
                : defaultColumn;
            }
          );

        setColumnMappings(
          mergedColumns
        );
      }

      setStatus("success");

      setMessage(
        `Existing mapping loaded for "${tableName}".`
      );
    } catch (error) {
      // A missing mapping is normal for a new table.
      // Keep the empty mapping form.

      console.log(
        `No existing mapping found for ${tableName}.`,
        error
      );
    }
  }

  // =========================================================
  // BUSINESS MAPPING CHANGE
  // =========================================================

  function handleMappingChange(
    event
  ) {
    const { name, value } =
      event.target;

    setMapping((current) => ({
      ...current,

      [name]:
        value,
    }));
  }

  // =========================================================
  // COLUMN MAPPING CHANGE
  // =========================================================

  function handleColumnMappingChange(
    index,
    field,
    value
  ) {
    setColumnMappings(
      (current) =>
        current.map(
          (item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,

                  [field]:
                    value,
                }
              : item
        )
    );
  }

  // =========================================================
  // SAVE BUSINESS MAPPING
  // =========================================================

  async function handleSaveMapping() {
  console.log("SAVE BUTTON CLICKED");

  if (!selectedTable) {
    console.error("No table selected");

    setStatus("error");
    setMessage("Please select a table first.");
    return;
  }

  if (!mapping.business_entity.trim()) {
    console.error("Business entity missing");

    setStatus("error");
    setMessage("Business Entity is required.");
    return;
  }

  const databaseName =
    schema?.database_name ||
    form.database_name ||
    "default";

  const payload = {
    table_name: selectedTable.table_name,

    business_entity:
      mapping.business_entity.trim(),

    business_description:
      mapping.business_description.trim(),

    primary_identifier:
      mapping.primary_identifier || null,

    date_field:
      mapping.date_field || null,

    amount_field:
      mapping.amount_field || null,

    status_field:
      mapping.status_field || null,

    column_mappings:
      columnMappings.map((column) => ({
        column_name: column.column_name,
        business_name:
          column.business_name?.trim() || "",
        description:
          column.description?.trim() || "",
      })),

    custom_mappings: [],

    custom_prompt:
      mapping.custom_prompt.trim(),
  };

  console.log("DATABASE:", databaseName);
  console.log("SAVE PAYLOAD:", payload);

  try {
    setStatus("loading");
    setMessage("Saving mapping and prompt...");

    const result =
      await saveTableMapping(
        payload,
        databaseName
      );

    console.log(
      "SAVE API RESPONSE:",
      result
    );

    setStatus("success");

    setMessage(
      `Mapping for "${selectedTable.table_name}" saved successfully.`
    );
  } catch (error) {
    console.error(
      "SAVE MAPPING ERROR:",
      error
    );

    setStatus("error");

    setMessage(
      error?.message ||
        "Unable to save mapping."
    );
  }
}


  // =========================================================
  // JSX
  // =========================================================

  return (
    <div className="app-shell">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="topbar">

        <div className="brand-block">

          <div className="brand-icon">
            DB
          </div>

          <div>

            <h1>
              AI Database Metadata Mapper
            </h1>

            <p>
              Metadata-only schema intelligence and
              business mapping
            </p>

          </div>

        </div>

        <div
          className={
            connectionSuccessful
              ? "status-badge connected"
              : "status-badge"
          }
        >

          <span className="status-dot" />

          {connectionSuccessful
            ? "Connected"
            : "Not Connected"}

        </div>

      </header>

      {/* =====================================================
          DASHBOARD
      ====================================================== */}

      <div className="dashboard">

        {/* ===================================================
            SIDEBAR
        ==================================================== */}

        <aside className="sidebar">

          {/* =================================================
              DATABASE CONNECTION PANEL
          ================================================== */}

          <section className="panel">

            <div className="panel-title-row">

              <div>

                <span className="panel-eyebrow">
                  DATABASE
                </span>

                <h2>
                  Target Connection
                </h2>

              </div>

            </div>

            <label>
              Database Engine
            </label>

            <select
              name="db_type"
              value={form.db_type}
              onChange={handleChange}
            >

              <option value="mysql">
                MySQL / MariaDB
              </option>

            </select>

            <div className="host-port-row">

              <div className="field-group">

                <label>
                  Host / IP
                </label>

                <input
                  type="text"
                  name="host"
                  value={form.host}
                  onChange={handleChange}
                  placeholder="127.0.0.1"
                />

              </div>

              <div className="field-group">

                <label>
                  Port
                </label>

                <input
                  type="number"
                  name="port"
                  value={form.port}
                  onChange={handleChange}
                  min="1"
                  max="65535"
                />

              </div>

            </div>

            <label>
              Database Name
            </label>

            <input
              type="text"
              name="database_name"
              value={form.database_name}
              onChange={handleChange}
              placeholder="metadata_test"
            />

            <label>
              Username
            </label>

            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="root"
            />

            <label>
              Password
            </label>

            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Database password"
              autoComplete="off"
            />

            <div className="action-row">

              <button
                type="button"
                className="secondary-button"
                onClick={
                  handleTestConnection
                }
                disabled={
                  status === "loading"
                }
              >
                Test Connection
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  handleFetchSchema
                }
                disabled={
                  status === "loading" ||
                  !connectionSuccessful ||
                  !consentGranted
                }
              >
                Fetch Schema
              </button>

            </div>

            {message && (
              <div
                className={`message ${status}`}
              >
                {message}
              </div>
            )}

          </section>

          {/* =================================================
              SCHEMA EXPLORER
          ================================================== */}

          <section className="panel schema-tree-panel">

            <div className="panel-title-row">

              <div>

                <span className="panel-eyebrow">
                  CATALOG
                </span>

                <h2>
                  Schema Explorer
                </h2>

              </div>

            </div>

            {!schema && (
              <div className="empty-sidebar">
                Connect and fetch schema to explore tables.
              </div>
            )}

            {schema && (
              <>

                <div className="database-node">

                  <span className="database-dot" />

                  <span>
                    {schema.database_name}
                  </span>

                </div>

                <div className="schema-tree">

                  {schema.tables.map(
                    (table, index) => {
                      const tableName =
                        table.table_name ||
                        table.name ||
                        `table_${index + 1}`;

                      return (
                        <button
                          key={`${schema.database_name}-${tableName}`}
                          type="button"
                          className={
                            selectedTable?.table_name ===
                            tableName
                              ? "table-tree-item active"
                              : "table-tree-item"
                          }
                          onClick={() =>
                            handleSelectTable(
                              table
                            )
                          }
                        >

                          <span className="table-name">

                            <span className="table-icon">
                              T
                            </span>

                            {tableName}

                          </span>

                          <span className="column-count">
                            {
                              table.columns
                                ?.length ?? 0
                            }
                          </span>

                        </button>
                      );
                    }
                  )}

                </div>

              </>
            )}

          </section>

        </aside>

        {/* ===================================================
            MAIN CONTENT
        ==================================================== */}

        <main className="main-content">

          {/* =================================================
              STATISTICS
          ================================================== */}

          <section className="stats-grid">

            <div className="stat-card">

              <span className="stat-icon">
                T
              </span>

              <div>

                <span className="stat-number">
                  {tableCount}
                </span>

                <span className="stat-label">
                  Discovered Tables
                </span>

              </div>

            </div>

            <div className="stat-card">

              <span className="stat-icon">
                C
              </span>

              <div>

                <span className="stat-number">
                  {columnCount}
                </span>

                <span className="stat-label">
                  Catalog Columns
                </span>

              </div>

            </div>

            <div className="stat-card">

              <span className="stat-icon">
                R
              </span>

              <div>

                <span className="stat-number">
                  {relationshipCount}
                </span>

                <span className="stat-label">
                  Relationships
                </span>

              </div>

            </div>

          </section>

          {/* =================================================
              MAIN CONTENT PANEL
          ================================================== */}

          <section className="content-panel">

            {!schema && (
              <div className="welcome-state">

                <div className="welcome-icon">
                  DB
                </div>

                <h2>
                  Database Metadata Workspace
                </h2>

                <p>
                  Connect a database and inspect
                  schema metadata without reading
                  actual business records.
                </p>

                <p className="security-note">
                  Only schema and metadata are accessed.
                </p>

              </div>
            )}

            {schema &&
              !selectedTable && (
                <div className="welcome-state">

                  <div className="welcome-icon success">
                    ✓
                  </div>

                  <h2>
                    Schema Loaded
                  </h2>

                  <p>
                    {tableCount} tables and{" "}
                    {columnCount} columns were
                    discovered.
                  </p>

                  <p>
                    Select a table from the Schema
                    Explorer to inspect and map it.
                  </p>

                </div>
              )}

            {/* =================================================
                SELECTED TABLE
            ================================================== */}

            {selectedTable && (
              <div className="table-details">

                <div className="table-header">

                  <div>

                    <span className="eyebrow">
                      SELECTED TABLE
                    </span>

                    <h2>
                      {
                        selectedTable.table_name
                      }
                    </h2>

                    <p className="table-subtitle">
                      Technical schema metadata and
                      business interpretation
                    </p>

                  </div>

                  <span className="table-count-badge">
                    {
                      selectedTable
                        .columns.length
                    }{" "}
                    columns
                  </span>

                </div>

                {/* =============================================
                    TECHNICAL METADATA
                ============================================== */}

                <div className="section-block">

                  <div className="section-heading">

                    <h3>
                      Technical Metadata
                    </h3>

                    <p>
                      Metadata only — no table rows are queried.
                    </p>

                  </div>

                  <div className="column-table">

                    <div className="column-table-header">

                      <span>
                        Column
                      </span>

                      <span>
                        Type
                      </span>

                      <span>
                        Nullable
                      </span>

                      <span>
                        Key / Reference
                      </span>

                    </div>

                    {selectedTable.columns.map(
                      (column, index) => (
                        <div
                          key={`${selectedTable.table_name}-${column.name}-${index}`}
                          className="column-row"
                        >

                          <span className="column-name">
                            {column.name}
                          </span>

                          <span className="type-badge">
                            {
                              column.data_type
                            }
                          </span>

                          <span>
                            {column.nullable
                              ? "Yes"
                              : "No"}
                          </span>

                          <span>

                            {column.is_primary_key && (
                              <span className="key-badge primary">
                                PK
                              </span>
                            )}

                            {column.is_foreign_key && (
                              <span className="reference-text">

                                <span className="key-badge foreign">
                                  FK
                                </span>

                                {column.referenced_table &&
                                  column.referenced_column && (
                                    <>
                                      {" "}
                                      {
                                        column.referenced_table
                                      }
                                      .
                                      {
                                        column.referenced_column
                                      }
                                    </>
                                  )}

                              </span>
                            )}

                            {!column.is_primary_key &&
                              !column.is_foreign_key && (
                                <span className="muted">
                                  —
                                </span>
                              )}

                          </span>

                        </div>
                      )
                    )}

                  </div>

                </div>

                {/* =============================================
                    RELATIONSHIPS
                ============================================== */}

                <div className="section-block">

                  <div className="section-heading">

                    <h3>
                      Relationships
                    </h3>

                    <p>
                      Foreign-key relationships discovered
                      from database metadata.
                    </p>

                  </div>

                  {selectedRelationships.length ===
                    0 && (
                    <div className="empty-relationship">
                      No relationship metadata was returned
                      for this table.
                    </div>
                  )}

                  {selectedRelationships.map(
                    (relationship, index) => (
                      <div
                        key={`${relationship.constraint_name}-${relationship.source_table}-${relationship.source_column}-${index}`}
                        className="relationship-card"
                      >

                        <strong>
                          {
                            relationship.source_table
                          }
                          .
                          {
                            relationship.source_column
                          }
                        </strong>

                        <span className="relationship-arrow">
                          →
                        </span>

                        <strong>
                          {
                            relationship.target_table
                          }
                          .
                          {
                            relationship.target_column
                          }
                        </strong>

                        <span className="constraint-name">
                          {
                            relationship.constraint_name
                          }
                        </span>

                      </div>
                    )
                  )}

                </div>

                {/* =============================================
                    BUSINESS MAPPING
                ============================================== */}

                <div className="section-block mapping-form">

                  <div className="section-heading">

                    <h3>
                      Business Mapping
                    </h3>

                    <p>
                      Translate technical schema into
                      business meaning for AI systems.
                    </p>

                  </div>

                  <div className="mapping-grid">

                    <div className="full-field">

                      <label>
                        Business Entity *
                      </label>

                      <input
                        type="text"
                        name="business_entity"
                        value={
                          mapping.business_entity
                        }
                        onChange={
                          handleMappingChange
                        }
                        placeholder="Example: Invoice"
                      />

                    </div>

                    <div className="full-field">

                      <label>
                        Business Description
                      </label>

                      <textarea
                        name="business_description"
                        value={
                          mapping.business_description
                        }
                        onChange={
                          handleMappingChange
                        }
                        placeholder="Example: Stores customer invoice information."
                        rows="3"
                      />

                    </div>

                    {/* PRIMARY IDENTIFIER */}

                    <div>

                      <label>
                        Primary Identifier
                      </label>

                      <select
                        name="primary_identifier"
                        value={
                          mapping.primary_identifier
                        }
                        onChange={
                          handleMappingChange
                        }
                      >

                        <option value="">
                          Select column
                        </option>

                        {selectedTable.columns.map(
                          (column) => (
                            <option
                              key={`primary-${selectedTable.table_name}-${column.name}`}
                              value={
                                column.name
                              }
                            >
                              {
                                column.name
                              }
                            </option>
                          )
                        )}

                      </select>

                    </div>

                    {/* DATE FIELD */}

                    <div>

                      <label>
                        Date Field
                      </label>

                      <select
                        name="date_field"
                        value={
                          mapping.date_field
                        }
                        onChange={
                          handleMappingChange
                        }
                      >

                        <option value="">
                          None
                        </option>

                        {selectedTable.columns.map(
                          (column) => (
                            <option
                              key={`date-${selectedTable.table_name}-${column.name}`}
                              value={
                                column.name
                              }
                            >
                              {
                                column.name
                              }
                            </option>
                          )
                        )}

                      </select>

                    </div>

                    {/* AMOUNT FIELD */}

                    <div>

                      <label>
                        Amount Field
                      </label>

                      <select
                        name="amount_field"
                        value={
                          mapping.amount_field
                        }
                        onChange={
                          handleMappingChange
                        }
                      >

                        <option value="">
                          None
                        </option>

                        {selectedTable.columns.map(
                          (column) => (
                            <option
                              key={`amount-${selectedTable.table_name}-${column.name}`}
                              value={
                                column.name
                              }
                            >
                              {
                                column.name
                              }
                            </option>
                          )
                        )}

                      </select>

                    </div>

                    {/* STATUS FIELD */}

                    <div>

                      <label>
                        Status Field
                      </label>

                      <select
                        name="status_field"
                        value={
                          mapping.status_field
                        }
                        onChange={
                          handleMappingChange
                        }
                      >

                        <option value="">
                          None
                        </option>

                        {selectedTable.columns.map(
                          (column) => (
                            <option
                              key={`status-${selectedTable.table_name}-${column.name}`}
                              value={
                                column.name
                              }
                            >
                              {
                                column.name
                              }
                            </option>
                          )
                        )}

                      </select>

                    </div>

                  </div>

                  {/* ===========================================
                      COLUMN BUSINESS MAPPING
                  ============================================ */}

                  <div className="column-mapping-section">

                    <div className="section-heading">

                      <h3>
                        Column Business Mapping
                      </h3>

                      <p>
                        Add human-friendly names and
                        descriptions for technical columns.
                      </p>

                    </div>

                    <div className="column-mapping-header">

                      <span>
                        Technical Column
                      </span>

                      <span>
                        Business Name
                      </span>

                      <span>
                        Description
                      </span>

                    </div>

                    {columnMappings.map(
                      (item, index) => (
                        <div
                          key={`${selectedTable.table_name}-mapping-${item.column_name}-${index}`}
                          className="column-mapping-row"
                        >

                          <div className="technical-column-name">
                            {
                              item.column_name
                            }
                          </div>

                          <input
                            type="text"
                            value={
                              item.business_name ||
                              ""
                            }
                            placeholder="Business name"
                            onChange={(event) =>
                              handleColumnMappingChange(
                                index,
                                "business_name",
                                event.target.value
                              )
                            }
                          />

                          <input
                            type="text"
                            value={
                              item.description ||
                              ""
                            }
                            placeholder="Description"
                            onChange={(event) =>
                              handleColumnMappingChange(
                                index,
                                "description",
                                event.target.value
                              )
                            }
                          />

                        </div>
                      )
                    )}

                  </div>

                  {/* ===========================================
                      CUSTOM AI PROMPT
                  ============================================ */}

                  <div className="prompt-block">

                    <label>
                      Table-specific AI Instruction
                    </label>

                    <textarea
                      name="custom_prompt"
                      value={
                        mapping.custom_prompt
                      }
                      onChange={
                        handleMappingChange
                      }
                      rows="5"
                      placeholder="Example: Use this table when the user asks about invoices, bills, payments, or invoice totals."
                    />

                    <p className="field-help">
                      This instruction is stored as metadata
                      for future AI integration. No table
                      records are read.
                    </p>

                  </div>

                  {/* ===========================================
                      SAVE
                  ============================================ */}

                  <div className="save-bar">

                    <div>

                      <strong>
                        Ready to save?
                      </strong>

                      <p>
                        Only business mapping metadata and
                        AI instructions are stored.
                      </p>

                    </div>

                    <button
                      type="button"
                      className="primary-button save-button"
                      onClick={
                        handleSaveMapping
                      }
                      disabled={
                        status === "loading"
                      }
                    >
                      {status === "loading"
                        ? "Saving..."
                        : "Save Mapping & Prompt"}
                    </button>

                  </div>

                </div>

              </div>
            )}

          </section>

        </main>

      </div>

      {/* =====================================================
          CONSENT MODAL
      ====================================================== */}

      {showConsent && (
        <div className="modal-overlay">

          <div className="modal">

            <div className="modal-icon">
              ✓
            </div>

            <h2>
              Allow Metadata Access?
            </h2>

            <p>
              The application requires permission
              to inspect the schema structure of{" "}
              <strong>
                {form.database_name}
              </strong>
              .
            </p>

            <div className="permission-grid">

              <div className="permission-card allow">

                <h3>
                  Accessed
                </h3>

                <ul>
                  <li>
                    Database name
                  </li>

                  <li>
                    Table names
                  </li>

                  <li>
                    Column names
                  </li>

                  <li>
                    Data types
                  </li>

                  <li>
                    Primary keys
                  </li>

                  <li>
                    Foreign keys
                  </li>

                  <li>
                    Relationships
                  </li>
                </ul>

              </div>

              <div className="permission-card deny">

                <h3>
                  Never Accessed
                </h3>

                <ul>
                  <li>
                    Customer records
                  </li>

                  <li>
                    Invoice records
                  </li>

                  <li>
                    Transaction records
                  </li>

                  <li>
                    Financial records
                  </li>

                  <li>
                    Actual table rows
                  </li>
                </ul>

              </div>

            </div>

            <div className="modal-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={
                  handleCancelConsent
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  handleAllowConsent
                }
                disabled={
                  status === "loading"
                }
              >
                {status === "loading"
                  ? "Saving Permission..."
                  : "Allow Metadata Access"}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default App;