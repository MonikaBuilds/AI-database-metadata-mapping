import { useMemo, useState } from "react";

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

  const [columnMappings, setColumnMappings] = useState([]);

  // =========================================================
  // APPLICATION STATE
  // =========================================================

  const [connectionSuccessful, setConnectionSuccessful] =
    useState(false);

  const [consentGranted, setConsentGranted] =
    useState(false);

  const [schema, setSchema] = useState(null);

  const [selectedTable, setSelectedTable] =
    useState(null);

  const [message, setMessage] = useState("");

  const [status, setStatus] = useState("idle");

  const [showConsent, setShowConsent] =
    useState(false);

  // =========================================================
  // DASHBOARD COUNTS
  // =========================================================

  const tableCount = schema?.tables?.length ?? 0;

  const columnCount = useMemo(() => {
    if (!schema?.tables) {
      return 0;
    }

    return schema.tables.reduce(
      (total, table) =>
        total + (table.columns?.length || 0),
      0
    );
  }, [schema]);

  const relationshipCount =
    schema?.relationships?.length ?? 0;

  // =========================================================
  // CONNECTION FORM CHANGE
  // =========================================================

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        name === "port"
          ? Number(value)
          : value,
    }));

    // Connection information changed.
    // Old connection state should not be trusted.

    setConnectionSuccessful(false);
    setConsentGranted(false);
    setSchema(null);
    setSelectedTable(null);
    setColumnMappings([]);
  }

  // =========================================================
  // VALIDATE DATABASE FORM
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
    const validationError = validateForm();

    if (validationError) {
      setStatus("error");
      setMessage(validationError);
      return;
    }

    setStatus("loading");
    setMessage("Testing database connection...");

    try {
      const result =
        await testDatabaseConnection(form);

      if (result?.success === false) {
        throw new Error(
          result.message ||
            "Unable to connect to database."
        );
      }

      setConnectionSuccessful(true);

      setStatus("success");

      setMessage(
        "Database connection successful."
      );

      // Ask user for metadata-only permission.
      setShowConsent(true);
    } catch (error) {
      setConnectionSuccessful(false);
      setConsentGranted(false);

      setStatus("error");

      setMessage(
        error.message ||
          "Database connection failed."
      );
    }
  }

  // =========================================================
  // GIVE METADATA CONSENT
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
        "Metadata access permission granted."
      );
    } catch (error) {
      setConsentGranted(false);

      setStatus("error");

      setMessage(
        error.message ||
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
        await fetchDatabaseSchema(form);

      setSchema(result);

      setSelectedTable(null);

      setColumnMappings([]);

      setStatus("success");

      setMessage(
        "Schema loaded successfully."
      );
    } catch (error) {
      setStatus("error");

      setMessage(
        error.message ||
          "Unable to fetch database schema."
      );
    }
  }

  // =========================================================
  // SELECT TABLE
  // =========================================================

  async function handleSelectTable(table) {
    setSelectedTable(table);

    // Create empty mapping for every column.

    const defaultColumns =
      table.columns.map((column) => ({
        column_name: column.name,
        business_name: "",
        description: "",
      }));

    setColumnMappings(defaultColumns);

    // Reset table mapping form.

    setMapping({
      business_entity: "",
      business_description: "",
      primary_identifier: "",
      date_field: "",
      amount_field: "",
      status_field: "",
      custom_prompt: "",
    });

    // Try loading existing saved mapping.

    try {
      const result =
        await getTableMapping(
          table.table_name,
          schema?.database_name || "default"
        );

      const saved =
        result?.data || result;

      if (saved) {
        setMapping({
          business_entity:
            saved.business_entity || "",

          business_description:
            saved.business_description ||
            saved.table_description ||
            "",

          primary_identifier:
            saved.primary_identifier || "",

          date_field:
            saved.date_field || "",

          amount_field:
            saved.amount_field || "",

          status_field:
            saved.status_field || "",

          custom_prompt:
            saved.custom_prompt || "",
        });

        if (
          saved.column_mappings &&
          saved.column_mappings.length > 0
        ) {
          setColumnMappings(
            saved.column_mappings
          );
        }
      }
    } catch (error) {
      /*
        It is completely fine if the selected table
        does not have a mapping yet.

        Therefore we keep the default empty mapping.
      */

      console.log(
        "No saved mapping found for table:",
        table.table_name
      );
    }
  }

  // =========================================================
  // UPDATE BUSINESS MAPPING FORM
  // =========================================================

  function handleMappingChange(event) {
    const { name, value } = event.target;

    setMapping((current) => ({
      ...current,
      [name]: value,
    }));
  }

  // =========================================================
  // UPDATE COLUMN BUSINESS MAPPING
  // =========================================================

  function handleColumnMappingChange(
    index,
    field,
    value
  ) {
    setColumnMappings((current) => {
      const updated = [...current];

      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      return updated;
    });
  }

  // =========================================================
  // SAVE BUSINESS MAPPING + PROMPT
  // =========================================================

  async function handleSaveMapping() {
    if (!selectedTable) {
      setStatus("error");

      setMessage(
        "Please select a table first."
      );

      return;
    }

    if (!mapping.business_entity.trim()) {
      setStatus("error");

      setMessage(
        "Business Entity is required."
      );

      return;
    }

    const payload = {
      table_name:
        selectedTable.table_name,

      business_entity:
        mapping.business_entity,

      business_description:
        mapping.business_description || "",

      primary_identifier:
        mapping.primary_identifier || null,

      date_field:
        mapping.date_field || null,

      amount_field:
        mapping.amount_field || null,

      status_field:
        mapping.status_field || null,

      column_mappings:
        columnMappings,

      custom_mappings: [],

      custom_prompt:
        mapping.custom_prompt || "",
    };

    try {
      setStatus("loading");

      setMessage(
        "Saving mapping and AI prompt..."
      );

      await saveTableMapping(
        payload,
        schema?.database_name || "default"
      );

      setStatus("success");

      setMessage(
        `Mapping for "${selectedTable.table_name}" saved successfully.`
      );
    } catch (error) {
      setStatus("error");

      setMessage(
        error.message ||
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
          TOP BAR
      ====================================================== */}

      <header className="topbar">

        <div>
          <h1>
            AI Metadata Mapper
          </h1>

          <p>
            Database Metadata Mapping Dashboard
          </p>
        </div>

        <div
          className={
            connectionSuccessful
              ? "status-badge connected"
              : "status-badge"
          }
        >
          {connectionSuccessful
            ? "Connected"
            : "Ready for Connection"}
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

          {/* DATABASE CONNECTION */}

          <section className="panel">

            <h2>
              Target Connection
            </h2>

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

              <option value="postgresql">
                PostgreSQL
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

            <h2>
              Schema Explorer
            </h2>

            {!schema && (
              <div className="empty-sidebar">
                No schema metadata loaded.
              </div>
            )}

            {schema && (
              <div className="schema-tree">

                <div className="database-name">
                  {schema.database_name}
                </div>

                {schema.tables?.map(
                  (table) => (
                    <button
                      type="button"
                      key={
                        table.table_name
                      }
                      className={
                        selectedTable?.table_name ===
                        table.table_name
                          ? "table-tree-item active"
                          : "table-tree-item"
                      }
                      onClick={() =>
                        handleSelectTable(
                          table
                        )
                      }
                    >
                      <span>
                        {
                          table.table_name
                        }
                      </span>

                      <span className="column-count">
                        {
                          table.columns
                            .length
                        }
                      </span>

                    </button>
                  )
                )}

              </div>
            )}

          </section>

        </aside>

        {/* ===================================================
            MAIN CONTENT
        ==================================================== */}

        <main className="main-content">

          {/* DASHBOARD STATS */}

          <section className="stats-grid">

            <div className="stat-card">

              <span className="stat-number">
                {tableCount}
              </span>

              <span className="stat-label">
                Discovered Tables
              </span>

            </div>

            <div className="stat-card">

              <span className="stat-number">
                {columnCount}
              </span>

              <span className="stat-label">
                Catalog Columns
              </span>

            </div>

            <div className="stat-card">

              <span className="stat-number">
                {relationshipCount}
              </span>

              <span className="stat-label">
                Relationships
              </span>

            </div>

          </section>

          {/* =================================================
              CONTENT PANEL
          ================================================== */}

          <section className="content-panel">

            {!schema && (
              <div className="welcome-state">

                <h2>
                  Database Schema Viewer
                </h2>

                <p>
                  Connect your database,
                  grant metadata-only access,
                  and fetch its schema.
                </p>

                <p className="security-note">
                  Actual business records
                  are not displayed or
                  requested.
                </p>

              </div>
            )}

            {schema &&
              !selectedTable && (
                <div className="welcome-state">

                  <h2>
                    Schema Loaded
                  </h2>

                  <p>
                    Select a table from
                    the Schema Explorer
                    to inspect and map
                    its metadata.
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
                      Selected Table
                    </span>

                    <h2>
                      {
                        selectedTable.table_name
                      }
                    </h2>

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
                    COLUMN METADATA
                ============================================== */}

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
                    (column) => (
                      <div
                        className="column-row"
                        key={column.name}
                      >

                        <span className="column-name">
                          {column.name}
                        </span>

                        <span>
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

                              {" "}

                              {
                                column.referenced_table
                              }
                              .
                              {
                                column.referenced_column
                              }

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

                {/* =============================================
                    RELATIONSHIPS
                ============================================== */}

                <div className="relationship-section">

                  <h3>
                    Relationships
                  </h3>

                  {schema.relationships
                    ?.filter(
                      (relationship) =>
                        relationship.source_table ===
                          selectedTable.table_name ||
                        relationship.target_table ===
                          selectedTable.table_name
                    )
                    .map(
                      (relationship) => (
                        <div
                          className="relationship-card"
                          key={
                            relationship.constraint_name
                          }
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

                  {schema.relationships?.filter(
                    (relationship) =>
                      relationship.source_table ===
                        selectedTable.table_name ||
                      relationship.target_table ===
                        selectedTable.table_name
                  ).length === 0 && (
                    <p className="muted">
                      No relationships
                      detected for this
                      table.
                    </p>
                  )}

                </div>

                {/* =============================================
                    BUSINESS MAPPING
                ============================================== */}

                <div className="mapping-form">

                  <h2>
                    Business Mapping
                  </h2>

                  <p className="muted">
                    Define how the AI
                    should understand this
                    database table.
                  </p>

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
                    rows="4"
                  />

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
                          key={
                            column.name
                          }
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
                          key={
                            column.name
                          }
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
                          key={
                            column.name
                          }
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
                          key={
                            column.name
                          }
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

                  {/* ===========================================
                      COLUMN BUSINESS MAPPINGS
                  ============================================ */}

                  <div className="column-mapping-section">

                    <h3>
                      Column Business
                      Mappings
                    </h3>

                    <p className="muted">
                      Give technical
                      database columns
                      human-friendly
                      business meanings.
                    </p>

                    {columnMappings.map(
                      (item, index) => (
                        <div
                          className="column-mapping-row"
                          key={
                            item.column_name
                          }
                        >

                          <div className="technical-column-name">
                            <strong>
                              {
                                item.column_name
                              }
                            </strong>
                          </div>

                          <input
                            type="text"
                            placeholder="Business name"
                            value={
                              item.business_name ||
                              ""
                            }
                            onChange={(
                              event
                            ) =>
                              handleColumnMappingChange(
                                index,
                                "business_name",
                                event.target
                                  .value
                              )
                            }
                          />

                          <input
                            type="text"
                            placeholder="Business description"
                            value={
                              item.description ||
                              ""
                            }
                            onChange={(
                              event
                            ) =>
                              handleColumnMappingChange(
                                index,
                                "description",
                                event.target
                                  .value
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

                  <label>
                    Custom AI Prompt
                  </label>

                  <textarea
                    name="custom_prompt"
                    value={
                      mapping.custom_prompt
                    }
                    onChange={
                      handleMappingChange
                    }
                    placeholder="Example: Use this table when the user asks about invoices, bills, payments, or invoice totals."
                    rows="5"
                  />

                  <button
                    type="button"
                    className="primary-button"
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
            )}

          </section>

        </main>

      </div>

      {/* =====================================================
          METADATA CONSENT MODAL
      ====================================================== */}

      {showConsent && (
        <div className="modal-overlay">

          <div className="modal">

            <h2>
              Allow Schema & Metadata
              Access?
            </h2>

            <p>
              This application requires
              permission to inspect the
              structure of:
            </p>

            <strong>
              {form.database_name}
            </strong>

            <div className="permission-grid">

              <div>

                <h3>
                  We will access
                </h3>

                <ul>
                  <li>
                    Database/schema name
                  </li>

                  <li>
                    Table names
                  </li>

                  <li>
                    Column names
                  </li>

                  <li>
                    Column data types
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

              <div>

                <h3>
                  We will NOT access
                </h3>

                <ul>
                  <li>
                    Customer records
                  </li>

                  <li>
                    Invoice records
                  </li>

                  <li>
                    Transactions
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
              >
                Allow Metadata Access
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default App;