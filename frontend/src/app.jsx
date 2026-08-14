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
    database_family: "sql",
    db_type: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database_name: "",
    username: "root",
    password: "",
  });

  const isMongoDB = form.db_type === "mongodb";

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
    aliases: [],
    primary_identifier: "",
    date_field: "",
    amount_field: "",
    status_field: "",
    customer_reference: "",
    custom_prompt: "",
  });
  const [aliasInput, setAliasInput] = useState("");

  const [relationships, setRelationships] = useState([]);

  const [relationshipForm, setRelationshipForm] = useState({
    source_column: "",
    target_table: "",
    target_column: "",
    description: "",
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
      aliases: [],
      primary_identifier: "",
      date_field: "",
      amount_field: "",
      status_field: "",
      customer_reference: "",
      custom_prompt: "",
    };
  }

  // =========================================================
  // NORMALIZE SCHEMA RESPONSE
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

          indexes:
            Array.isArray(table?.indexes)
              ? table.indexes
              : [],
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

  const indexCount =
    useMemo(() => {
      if (!schema?.tables) {
        return 0;
      }

      return schema.tables.reduce(
        (total, table) =>
          total +
          (table?.indexes?.length || 0),
        0
      );
    }, [schema]);

  const targetTableColumns = useMemo(() => {
    if (
      !relationshipForm.target_table ||
      !schema?.tables
    ) {
      return [];
    }

    const targetTable = schema.tables.find(
      (table) =>
        table.table_name === relationshipForm.target_table
    );

    return targetTable?.columns || [];
  }, [schema, relationshipForm.target_table]);
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
    const { name, value } = event.target;

    setForm((current) => {
      const updatedForm = {
        ...current,
        [name]:
          name === "port"
            ? Number(value)
            : value,
      };

      if (name === "db_type") {
        if (value === "mysql") {
          updatedForm.port = 3306;
        } else if (value === "postgresql") {
          updatedForm.port = 5432;
        } else if (value === "mongodb") {
          updatedForm.port = 27017;
        }
      }

      return updatedForm;
    });

    setConnectionSuccessful(false);
    setConsentGranted(false);
    setShowConsent(false);
    setSchema(null);
    setSelectedTable(null);
    setColumnMappings([]);
    setMapping(getEmptyMapping());
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
      isMongoDB
        ? "Fetching MongoDB metadata..."
        : "Fetching database schema..."
    );

    try {
      const result =
        await fetchDatabaseSchema(
          form
        );

      const normalizedSchema =
        normalizeSchemaResponse(
          result
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
      setAliasInput("");
      setStatus("success");

      setMessage(
        isMongoDB
          ? `Metadata loaded successfully: ${normalizedSchema.tables.length} collections found.`
          : `Schema loaded successfully: ${normalizedSchema.tables.length} tables found.`
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
  // SELECT TABLE / COLLECTION
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
        isMongoDB
          ? "Invalid collection metadata."
          : "Invalid table metadata."
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

      indexes:
        Array.isArray(
          table.indexes
        )
          ? table.indexes
          : [],
    };

    setSelectedTable(
      normalizedTable
    );

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

    setAliasInput("");
    setRelationships([]);

    setRelationshipForm({
      source_column: "",
      target_table: "",
      target_column: "",
      description: "",
    });

    setStatus("idle");

    setMessage(
      isMongoDB
        ? `Selected collection: ${tableName}`
        : `Selected table: ${tableName}`
    );

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
          saved?.business_entity || "",

        business_description:
          saved?.business_description ||
          saved?.table_description ||
          "",

        aliases:
          Array.isArray(saved?.aliases)
            ? saved.aliases
            : [],

        primary_identifier:
          saved?.primary_identifier || "",

        date_field:
          saved?.date_field || "",

        amount_field:
          saved?.amount_field || "",

        status_field:
          saved?.status_field || "",

        customer_reference:
          saved?.customer_reference || "",

        custom_prompt:
          saved?.custom_prompt || "",
      });

      setRelationships(
        Array.isArray(saved?.relationships)
          ? saved.relationships
          : []
      );

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
        isMongoDB
          ? `Existing mapping loaded for collection "${tableName}".`
          : `Existing mapping loaded for "${tableName}".`
      );
    } catch (error) {
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

  function handleAddAlias() {
    const alias = aliasInput.trim();

    if (!alias) {
      return;
    }

    const alreadyExists = mapping.aliases.some(
      (item) =>
        item.toLowerCase() === alias.toLowerCase()
    );

    if (alreadyExists) {
      setAliasInput("");
      return;
    }

    setMapping((current) => ({
      ...current,
      aliases: [...current.aliases, alias],
    }));

    setAliasInput("");
  }

  function handleRemoveAlias(aliasToRemove) {
    setMapping((current) => ({
      ...current,
      aliases: current.aliases.filter(
        (alias) => alias !== aliasToRemove
      ),
    }));
  }

  function handleRelationshipChange(event) {
    const { name, value } = event.target;

    setRelationshipForm((current) => ({
      ...current,
      [name]: value,

      // Reset target column when target table changes
      ...(name === "target_table"
        ? { target_column: "" }
        : {}),
    }));
  }


  function handleAddRelationship() {
    const {
      source_column,
      target_table,
      target_column,
      description,
    } = relationshipForm;

    if (
      !source_column ||
      !target_table ||
      !target_column
    ) {
      setStatus("error");

      setMessage(
        "Source column, target table and target column are required."
      );

      return;
    }

    const alreadyExists = relationships.some(
      (relationship) =>
        relationship.source_column === source_column &&
        relationship.target_table === target_table &&
        relationship.target_column === target_column
    );

    if (alreadyExists) {
      setStatus("error");

      setMessage(
        "This relationship already exists."
      );

      return;
    }

    setRelationships((current) => [
      ...current,
      {
        source_column,
        target_table,
        target_column,
        description:
          description.trim() || null,
      },
    ]);

    setRelationshipForm({
      source_column: "",
      target_table: "",
      target_column: "",
      description: "",
    });

    setStatus("success");

    setMessage("Relationship added.");
  }


  function handleRemoveRelationship(indexToRemove) {
    setRelationships((current) =>
      current.filter(
        (_, index) =>
          index !== indexToRemove
      )
    );
  }

  // =========================================================
  // COLUMN / FIELD MAPPING CHANGE
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
    if (!selectedTable) {
      setStatus("error");

      setMessage(
        isMongoDB
          ? "Please select a collection first."
          : "Please select a table first."
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

    const databaseName =
      schema?.database_name ||
      form.database_name ||
      "default";

    const payload = {
      table_name:
        selectedTable.table_name,

      business_entity:
        mapping.business_entity.trim(),

      business_description:
        mapping.business_description.trim(),

      aliases:
        mapping.aliases,

      primary_identifier:
        mapping.primary_identifier || null,

      date_field:
        mapping.date_field || null,

      amount_field:
        mapping.amount_field || null,

      status_field:
        mapping.status_field || null,

      customer_reference:
        mapping.customer_reference || null,

      relationships,

      column_mappings:
        columnMappings.map((column) => ({
          column_name:
            column.column_name,

          business_name:
            column.business_name?.trim() || "",

          description:
            column.description?.trim() || "",
        })),

      custom_mappings: [],

      custom_prompt:
        mapping.custom_prompt.trim(),
    };

    try {
      setStatus("loading");

      setMessage(
        "Saving mapping and prompt..."
      );

      await saveTableMapping(
        payload,
        databaseName
      );

      setStatus("success");

      setMessage(
        isMongoDB
          ? `Mapping for collection "${selectedTable.table_name}" saved successfully.`
          : `Mapping for "${selectedTable.table_name}" saved successfully.`
      );
    } catch (error) {
      console.error(
        "Save mapping error:",
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
  // AI PROMPT PREVIEW
  // =========================================================

  const promptPreview = useMemo(() => {
    if (!selectedTable) {
      return "";
    }

    const lines = [];

    const entity =
      mapping.business_entity.trim() ||
      selectedTable.table_name;

    lines.push(
      `${entity} data can be found in ${isMongoDB ? "collection" : "table"
      } "${selectedTable.table_name}".`
    );

    if (mapping.business_description.trim()) {
      lines.push("");
      lines.push(
        `Description: ${mapping.business_description.trim()}`
      );
    }

    if (mapping.aliases.length > 0) {
      lines.push("");
      lines.push(
        `Aliases: ${mapping.aliases.join(", ")}`
      );
    }

    if (mapping.primary_identifier) {
      lines.push("");
      lines.push(
        `Primary identifier: ${mapping.primary_identifier}`
      );
    }

    if (mapping.date_field) {
      lines.push(
        `Date field: ${mapping.date_field}`
      );
    }

    if (mapping.amount_field) {
      lines.push(
        `Amount field: ${mapping.amount_field}`
      );
    }

    if (mapping.status_field) {
      lines.push(
        `Status field: ${mapping.status_field}`
      );
    }

    if (mapping.customer_reference) {
      lines.push(
        `Customer reference: ${mapping.customer_reference}`
      );
    }

    const mappedColumns = columnMappings.filter(
      (column) => column.business_name?.trim()
    );

    if (mappedColumns.length > 0) {
      lines.push("");
      lines.push("Important fields:");

      mappedColumns.forEach((column) => {
        lines.push(
          `${column.column_name} -> ${column.business_name}`
        );
      });
    }

    if (relationships.length > 0) {
      lines.push("");
      lines.push("Relationships:");

      relationships.forEach((relationship) => {
        lines.push(
          `${selectedTable.table_name}.${relationship.source_column} -> ${relationship.target_table}.${relationship.target_column}`
        );
      });
    }

    if (mapping.custom_prompt.trim()) {
      lines.push("");
      lines.push(
        `Instruction: ${mapping.custom_prompt.trim()}`
      );
    }

    return lines.join("\n");
  }, [
    selectedTable,
    mapping,
    columnMappings,
    relationships,
    isMongoDB,
  ]);

  // =========================================================
  // JSX
  // =========================================================

  return (
    <div className="app-shell">

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

      <div className="dashboard">

        <aside className="sidebar">

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
              Database Type
            </label>

            <select
              name="database_family"
              value={form.database_family}
              onChange={(event) => {
                const family =
                  event.target.value;

                setForm((current) => ({
                  ...current,

                  database_family:
                    family,

                  db_type:
                    family === "sql"
                      ? "mysql"
                      : "mongodb",

                  port:
                    family === "sql"
                      ? 3306
                      : 27017,

                  username:
                    family === "sql"
                      ? "root"
                      : "",

                  password: "",
                }));

                setConnectionSuccessful(false);
                setConsentGranted(false);
                setShowConsent(false);
                setSchema(null);
                setSelectedTable(null);
                setColumnMappings([]);
                setMapping(getEmptyMapping());
                setStatus("idle");
                setMessage("");
              }}
            >
              <option value="sql">
                SQL
              </option>

              <option value="nosql">
                NoSQL
              </option>
            </select>

            <label>
              Database Engine
            </label>

            <select
              name="db_type"
              value={form.db_type}
              onChange={handleChange}
            >
              {form.database_family === "sql" ? (
                <>
                  <option value="mysql">
                    MySQL / MariaDB
                  </option>

                  <option value="postgresql">
                    PostgreSQL
                  </option>
                </>
              ) : (
                <option value="mongodb">
                  MongoDB
                </option>
              )}
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
              placeholder={
                isMongoDB
                  ? "metadata_mongo_test"
                  : "metadata_test"
              }
            />

            <label>
              Username
            </label>

            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder={
                isMongoDB
                  ? "MongoDB username"
                  : "root"
              }
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
                {isMongoDB
                  ? "Fetch Metadata"
                  : "Fetch Schema"}
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

          <section className="panel schema-tree-panel">

            <div className="panel-title-row">

              <div>

                <span className="panel-eyebrow">
                  CATALOG
                </span>

                <h2>
                  {isMongoDB
                    ? "Collection Explorer"
                    : "Schema Explorer"}
                </h2>

              </div>

            </div>

            {!schema && (
              <div className="empty-sidebar">
                {isMongoDB
                  ? "Connect and fetch metadata to explore collections."
                  : "Connect and fetch schema to explore tables."}
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
                              {isMongoDB ? "C" : "T"}
                            </span>

                            {tableName}

                          </span>

                          <span className="column-count">
                            {isMongoDB
                              ? table.indexes?.length ?? 0
                              : table.columns?.length ?? 0}
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

        <main className="main-content">

          <section className="stats-grid">

            <div className="stat-card">

              <span className="stat-icon">
                {isMongoDB ? "C" : "T"}
              </span>

              <div>

                <span className="stat-number">
                  {tableCount}
                </span>

                <span className="stat-label">
                  {isMongoDB
                    ? "Discovered Collections"
                    : "Discovered Tables"}
                </span>

              </div>

            </div>

            <div className="stat-card">

              <span className="stat-icon">
                F
              </span>

              <div>

                <span className="stat-number">
                  {columnCount}
                </span>

                <span className="stat-label">
                  {isMongoDB
                    ? "Schema Fields"
                    : "Catalog Columns"}
                </span>

              </div>

            </div>

            <div className="stat-card">

              <span className="stat-icon">
                {isMongoDB ? "I" : "R"}
              </span>

              <div>

                <span className="stat-number">
                  {isMongoDB
                    ? indexCount
                    : relationshipCount}
                </span>

                <span className="stat-label">
                  {isMongoDB
                    ? "Indexes"
                    : "Relationships"}
                </span>

              </div>

            </div>

          </section>

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
                  metadata without reading actual
                  business records.
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
                    {isMongoDB
                      ? "MongoDB Metadata Loaded"
                      : "Schema Loaded"}
                  </h2>

                  <p>
                    {tableCount}{" "}
                    {isMongoDB
                      ? "collections"
                      : "tables"}{" "}
                    and {columnCount}{" "}
                    {isMongoDB
                      ? "schema fields"
                      : "columns"}{" "}
                    were discovered.
                  </p>

                  {isMongoDB && (
                    <p>
                      {indexCount} indexes were discovered.
                    </p>
                  )}

                  <p>
                    Select a{" "}
                    {isMongoDB
                      ? "collection"
                      : "table"}{" "}
                    from the explorer to inspect and map it.
                  </p>

                </div>
              )}

            {selectedTable && (
              <div className="table-details">

                <div className="table-header">

                  <div>

                    <span className="eyebrow">
                      {isMongoDB
                        ? "SELECTED COLLECTION"
                        : "SELECTED TABLE"}
                    </span>

                    <h2>
                      {selectedTable.table_name}
                    </h2>

                    <p className="table-subtitle">
                      {isMongoDB
                        ? "MongoDB collection metadata and business interpretation"
                        : "Technical schema metadata and business interpretation"}
                    </p>

                  </div>

                  <span className="table-count-badge">
                    {isMongoDB
                      ? `${selectedTable.indexes?.length ?? 0} indexes`
                      : `${selectedTable.columns.length} columns`}
                  </span>

                </div>

                {/* =============================================
                    TECHNICAL METADATA
                ============================================== */}

                <div className="section-block">

                  <div className="section-heading">

                    <h3>
                      {isMongoDB
                        ? "Schema Field Metadata"
                        : "Technical Metadata"}
                    </h3>

                    <p>
                      Metadata only — no business records are queried.
                    </p>

                  </div>

                  {selectedTable.columns.length > 0 ? (
                    <div className="column-table">

                      <div className="column-table-header">

                        <span>
                          {isMongoDB
                            ? "Field"
                            : "Column"}
                        </span>

                        <span>
                          Type
                        </span>

                        <span>
                          {isMongoDB
                            ? "Optional"
                            : "Nullable"}
                        </span>

                        <span>
                          {isMongoDB
                            ? "Metadata"
                            : "Key / Reference"}
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
                              {column.data_type}
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
                                        {column.referenced_table}.
                                        {column.referenced_column}
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
                  ) : (
                    <div className="empty-relationship">
                      {isMongoDB
                        ? "No explicit field schema was returned. MongoDB collections may be schemaless."
                        : "No column metadata was returned."}
                    </div>
                  )}

                </div>

                {/* =============================================
                    MONGODB INDEXES
                ============================================== */}

                {isMongoDB && (
                  <div className="section-block">

                    <div className="section-heading">

                      <h3>
                        Indexes
                      </h3>

                      <p>
                        Index metadata discovered from MongoDB.
                      </p>

                    </div>

                    {selectedTable.indexes?.length > 0 ? (
                      selectedTable.indexes.map(
                        (index, indexPosition) => (
                          <div
                            className="relationship-card"
                            key={`${index.name}-${indexPosition}`}
                          >

                            <strong>
                              {index.name}
                            </strong>

                            <span>
                              {index.keys
                                ?.map(
                                  ([field, direction]) =>
                                    `${field} (${direction})`
                                )
                                .join(", ")}
                            </span>

                            <span className="constraint-name">
                              {index.unique
                                ? "Unique"
                                : "Non-unique"}
                            </span>

                          </div>
                        )
                      )
                    ) : (
                      <div className="empty-relationship">
                        No indexes were returned for this collection.
                      </div>
                    )}

                  </div>
                )}

                {/* =============================================
                    SQL RELATIONSHIPS
                ============================================== */}

                {!isMongoDB && (
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
                            {relationship.source_table}.
                            {relationship.source_column}
                          </strong>

                          <span className="relationship-arrow">
                            →
                          </span>

                          <strong>
                            {relationship.target_table}.
                            {relationship.target_column}
                          </strong>

                          <span className="constraint-name">
                            {relationship.constraint_name}
                          </span>

                        </div>
                      )
                    )}

                  </div>
                )}

                {/* =============================================
                    BUSINESS MAPPING
                ============================================== */}

                <div className="section-block mapping-form">

                  <div className="section-heading">

                    <h3>
                      Business Mapping
                    </h3>

                    <p>
                      Translate technical metadata into
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
                        placeholder={
                          isMongoDB
                            ? "Example: Customer"
                            : "Example: Invoice"
                        }
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
                        placeholder="Explain what this data entity represents."
                        rows="3"
                      />

                    </div>
                    {/* AI ALIASES */}
                    <div className="full-field">
                      <label>
                        AI Aliases
                      </label>

                      <div className="alias-input-row">
                        <input
                          type="text"
                          value={aliasInput}
                          onChange={(event) =>
                            setAliasInput(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddAlias();
                            }
                          }}
                          placeholder="Example: Bill, Sales Invoice, Customer Bill"
                        />

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={handleAddAlias}
                        >
                          Add Alias
                        </button>
                      </div>

                      {mapping.aliases.length > 0 && (
                        <div className="alias-list">
                          {mapping.aliases.map((alias) => (
                            <span
                              className="alias-chip"
                              key={alias}
                            >
                              {alias}

                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveAlias(alias)
                                }
                                aria-label={`Remove ${alias}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="field-help">
                        Add alternative business terms for this table.
                      </p>
                    </div>


                    {/* KEEP YOUR EXISTING PRIMARY IDENTIFIER CODE */}
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
                          {isMongoDB
                            ? "Select field"
                            : "Select column"}
                        </option>

                        {selectedTable.columns.map(
                          (column) => (
                            <option
                              key={`primary-${selectedTable.table_name}-${column.name}`}
                              value={
                                column.name
                              }
                            >
                              {column.name}
                            </option>
                          )
                        )}

                      </select>

                    </div>

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
                              value={column.name}
                            >
                              {column.name}
                            </option>
                          )
                        )}

                      </select>

                    </div>

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
                              value={column.name}
                            >
                              {column.name}
                            </option>
                          )
                        )}

                      </select>

                    </div>

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
                              value={column.name}
                            >
                              {column.name}
                            </option>
                          )
                        )}

                      </select>

                    </div>

                  </div>
                  {/* CUSTOMER REFERENCE */}

                  <div>
                    <label>
                      Customer Reference
                    </label>

                    <select
                      name="customer_reference"
                      value={mapping.customer_reference}
                      onChange={handleMappingChange}
                    >
                      <option value="">
                        {isMongoDB
                          ? "None / Select field"
                          : "None / Select column"}
                      </option>

                      {selectedTable.columns.map(
                        (column) => (
                          <option
                            key={`customer-reference-${selectedTable.table_name}-${column.name}`}
                            value={column.name}
                          >
                            {column.name}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  {/* ===========================================
                      MANUAL RELATIONSHIP MAPPING
                  ============================================ */}

                  <div className="column-mapping-section">

                    <div className="section-heading">

                      <h3>
                        Relationship Mapping
                      </h3>

                      <p>
                        Define how this{" "}
                        {isMongoDB ? "collection" : "table"}{" "}
                        is connected to another{" "}
                        {isMongoDB ? "collection." : "table."}
                      </p>

                    </div>


                    <div className="mapping-grid">

                      {/* Source Column */}
                      <div>

                        <label>
                          {isMongoDB
                            ? "Source Field"
                            : "Source Column"}
                        </label>

                        <select
                          name="source_column"
                          value={relationshipForm.source_column}
                          onChange={handleRelationshipChange}
                        >

                          <option value="">
                            {isMongoDB
                              ? "Select field"
                              : "Select column"}
                          </option>

                          {selectedTable.columns.map(
                            (column) => (
                              <option
                                key={`relationship-source-${column.name}`}
                                value={column.name}
                              >
                                {column.name}
                              </option>
                            )
                          )}

                        </select>

                      </div>


                      {/* Target Table */}
                      <div>

                        <label>
                          {isMongoDB
                            ? "Target Collection"
                            : "Target Table"}
                        </label>

                        <select
                          name="target_table"
                          value={relationshipForm.target_table}
                          onChange={handleRelationshipChange}
                        >

                          <option value="">
                            {isMongoDB
                              ? "Select collection"
                              : "Select table"}
                          </option>

                          {(schema?.tables || [])
                            .filter(
                              (table) =>
                                table.table_name !==
                                selectedTable.table_name
                            )
                            .map((table) => (
                              <option
                                key={`relationship-target-${table.table_name}`}
                                value={table.table_name}
                              >
                                {table.table_name}
                              </option>
                            ))}

                        </select>

                      </div>


                      {/* Target Column */}
                      <div>

                        <label>
                          {isMongoDB
                            ? "Target Field"
                            : "Target Column"}
                        </label>

                        <select
                          name="target_column"
                          value={relationshipForm.target_column}
                          onChange={handleRelationshipChange}
                          disabled={!relationshipForm.target_table}
                        >

                          <option value="">
                            {isMongoDB
                              ? "Select field"
                              : "Select column"}
                          </option>

                          {targetTableColumns.map(
                            (column) => (
                              <option
                                key={`relationship-target-column-${column.name}`}
                                value={column.name}
                              >
                                {column.name}
                              </option>
                            )
                          )}

                        </select>

                      </div>


                      {/* Description */}
                      <div className="full-field">

                        <label>
                          Description
                        </label>

                        <input
                          type="text"
                          name="description"
                          value={relationshipForm.description}
                          onChange={handleRelationshipChange}
                          placeholder="Example: Links invoice to customer"
                        />

                      </div>

                    </div>


                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleAddRelationship}
                    >
                      Add Relationship
                    </button>


                    {/* Added Relationships */}
                    {relationships.length > 0 && (

                      <div className="relationship-list">

                        {relationships.map(
                          (relationship, index) => (

                            <div
                              className="relationship-card"
                              key={`${relationship.source_column}-${relationship.target_table}-${relationship.target_column}-${index}`}
                            >

                              <strong>
                                {selectedTable.table_name}.
                                {relationship.source_column}
                              </strong>

                              <span>
                                →
                              </span>

                              <strong>
                                {relationship.target_table}.
                                {relationship.target_column}
                              </strong>


                              {relationship.description && (
                                <span>
                                  {relationship.description}
                                </span>
                              )}


                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                  handleRemoveRelationship(index)
                                }
                              >
                                Remove
                              </button>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>
                  {/* ===========================================
                      FIELD / COLUMN BUSINESS MAPPING
                  ============================================ */}

                  <div className="column-mapping-section">

                    <div className="section-heading">

                      <h3>
                        {isMongoDB
                          ? "Field Business Mapping"
                          : "Column Business Mapping"}
                      </h3>

                      <p>
                        Add human-friendly names and descriptions
                        for technical{" "}
                        {isMongoDB
                          ? "fields."
                          : "columns."}
                      </p>

                    </div>

                    {columnMappings.length > 0 ? (
                      <>
                        <div className="column-mapping-header">

                          <span>
                            {isMongoDB
                              ? "Technical Field"
                              : "Technical Column"}
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
                                {item.column_name}
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
                      </>
                    ) : (
                      <div className="empty-relationship">
                        {isMongoDB
                          ? "No explicit MongoDB fields are available yet. Field mappings will become available when schema validator metadata is present."
                          : "No columns are available for mapping."}
                      </div>
                    )}

                  </div>
                  {/* ===========================================
                      AI PROMPT PREVIEW
                  ============================================ */}

                  <div className="column-mapping-section">

                    <div className="section-heading">
                      <h3>AI Prompt Preview</h3>

                      <p>
                        Preview generated from the current metadata
                        and business mapping.
                      </p>
                    </div>

                    <textarea
                      value={promptPreview}
                      readOnly
                      rows="14"
                    />

                  </div>
                  {/* ===========================================
                      CUSTOM AI PROMPT
                  ============================================ */}

                  <div className="prompt-block">

                    <label>
                      {isMongoDB
                        ? "Collection-specific AI Instruction"
                        : "Table-specific AI Instruction"}
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
                      placeholder={
                        isMongoDB
                          ? "Example: Use this collection when the user asks about customers."
                          : "Example: Use this table when the user asks about invoices, bills, payments, or invoice totals."
                      }
                    />

                    <p className="field-help">
                      This instruction is stored as metadata
                      for future AI integration. No business
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
              to inspect metadata for{" "}
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
                    {isMongoDB
                      ? "Collection names"
                      : "Table names"}
                  </li>

                  <li>
                    {isMongoDB
                      ? "Schema validator fields (when defined)"
                      : "Column names"}
                  </li>

                  <li>
                    {isMongoDB
                      ? "Index metadata"
                      : "Data types"}
                  </li>

                  {!isMongoDB && (
                    <>
                      <li>
                        Primary keys
                      </li>

                      <li>
                        Foreign keys
                      </li>

                      <li>
                        Relationships
                      </li>
                    </>
                  )}

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
                    Actual business data
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