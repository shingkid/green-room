import type { HintContent } from "./schemaHints";
import styles from "./RegistryEditor.module.css";

type SchemaHintsPanelProps = {
  hint: HintContent | null;
};

export function SchemaHintsPanel({ hint }: SchemaHintsPanelProps) {
  return (
    <div className={styles.hintsSection}>
      <div className={styles.hintsTitle}>Schema Hints</div>
      {hint ? (
        <div className={styles.hintsBody}>
          <div className={styles.hintsContext}>{hint.title}</div>
          {hint.summaryDescription ? (
            <div className={styles.hintsDescription}>{hint.summaryDescription}</div>
          ) : null}
          <div className={styles.hintsSchemaNote}>
            See <code>service_registry.schema.json</code> for full details.
          </div>
          <div className={styles.hintsLabel}>Required fields</div>
          <div className={styles.hintsFields}>
            {hint.requiredFields.map((field) => (
              <div className={styles.hintsField} key={`required-${field.name}`}>
                <div className={styles.hintsFieldName}>{field.name}</div>
                {field.summaryDescription ? (
                  <div className={styles.hintsFieldDescription}>{field.summaryDescription}</div>
                ) : null}
                {field.enumValues?.length ? (
                  <div className={styles.hintsEnumValues}>
                    Allowed: {field.enumValues.join(", ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {hint.optionalFields.length > 0 ? (
            <>
              <div className={styles.hintsLabel}>Optional fields</div>
              <div className={styles.hintsFields}>
                {hint.optionalFields.map((field) => (
                  <div className={styles.hintsField} key={`optional-${field.name}`}>
                    <div className={styles.hintsFieldName}>{field.name}</div>
                    {field.summaryDescription ? (
                      <div className={styles.hintsFieldDescription}>{field.summaryDescription}</div>
                    ) : null}
                    {field.enumValues?.length ? (
                      <div className={styles.hintsEnumValues}>
                        Allowed: {field.enumValues.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className={styles.hintsLabel}>Starter shape</div>
          <pre className={styles.hintsSnippet}>{hint.snippet}</pre>
        </div>
      ) : (
        <div className={styles.hintsEmpty}>
          Move the cursor inside a `services`, `business_flows`, or `data_flows` entry to see schema
          guidance.
        </div>
      )}
    </div>
  );
}
