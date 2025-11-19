// src/UserDataViewer.tsx
import { useState } from "react";
import { supabase } from "./supabaseClient";

interface UserDataViewerProps {
  userId: string;
}

export function UserDataViewer({ userId }: UserDataViewerProps) {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("📥 Fetching user data for:", userId);

      const { data, error } = await supabase.functions.invoke("get-user-data", {
        body: { userId }
      });

      if (error) {
        throw new Error(error.message || "Failed to fetch data");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unknown error");
      }

      setUserData(data);
      console.log("✅ Data loaded:", data);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch user data");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => ({
    padding: "0.25rem 0.75rem",
    borderRadius: "12px",
    fontSize: "0.8rem",
    fontWeight: 600,
    background: status === "normal" || status === "optimal" ? "#efe" : "#fee",
    color: status === "normal" || status === "optimal" ? "#060" : "#c00",
  });

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>📊 Complete Health Profile</h2>
        <p style={{ color: "#888", marginBottom: "1.5rem" }}>
          View all your health data in one place
        </p>
        
        <button
          style={loading ? styles.btnDisabled : styles.btn}
          onClick={fetchUserData}
          disabled={loading}
        >
          {loading ? "⏳ Loading All Data..." : "📥 Fetch Complete Health Data"}
        </button>

        {error && <div style={styles.errorBox}>{error}</div>}
      </div>

      {/* Summary Cards */}
      {userData && (
        <>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>🧪</div>
              <div style={styles.summaryValue}>{userData.summary.totalBiomarkers}</div>
              <div style={styles.summaryLabel}>Biomarkers</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>📊</div>
              <div style={styles.summaryValue}>{userData.summary.totalLabPanels}</div>
              <div style={styles.summaryLabel}>Lab Panels</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>🔬</div>
              <div style={styles.summaryValue}>{userData.summary.totalStructuredLabs}</div>
              <div style={styles.summaryLabel}>Structured Labs</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>⌚</div>
              <div style={styles.summaryValue}>{userData.summary.totalWearableDays}</div>
              <div style={styles.summaryLabel}>Wearable Days</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>🧬</div>
              <div style={styles.summaryValue}>{userData.summary.totalGenomicRecords}</div>
              <div style={styles.summaryLabel}>Genomic</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>💊</div>
              <div style={styles.summaryValue}>{userData.summary.totalMedications}</div>
              <div style={styles.summaryLabel}>Medications</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>🧫</div>
              <div style={styles.summaryValue}>{userData.summary.totalMetabolomics}</div>
              <div style={styles.summaryLabel}>Metabolomics</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>🦠</div>
              <div style={styles.summaryValue}>{userData.summary.totalMicrobiome}</div>
              <div style={styles.summaryLabel}>Microbiome</div>
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryIcon}>📋</div>
              <div style={styles.summaryValue}>{userData.summary.totalSurveys}</div>
              <div style={styles.summaryLabel}>Surveys</div>
            </div>
          </div>

          {/* User Profile */}
          {userData.userData.profile && (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>👤 User Profile</h3>
              <div style={styles.profileGrid}>
                <div>
                  <strong>Name:</strong> {userData.userData.profile.first_name} {userData.userData.profile.last_name}
                </div>
                <div>
                  <strong>Age:</strong> {userData.userData.profile.age}
                </div>
                <div>
                  <strong>Sex:</strong> {userData.userData.profile.sex}
                </div>
                <div>
                  <strong>Height:</strong> {userData.userData.profile.height_cm} cm
                </div>
                <div>
                  <strong>Weight:</strong> {userData.userData.profile.weight_kg} kg
                </div>
                <div>
                  <strong>BMI:</strong> {userData.userData.profile.bmi.toFixed(1)}
                </div>
              </div>
            </div>
          )}

          {/* Recent Biomarkers */}
          {userData.userData.biomarkers.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>🧪 Recent Biomarkers (Last 10)</h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Test Name</th>
                      <th style={styles.th}>Value</th>
                      <th style={styles.th}>Unit</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userData.userData.biomarkers.slice(0, 10).map((b: any) => (
                      <tr key={b.id} style={styles.tr}>
                        <td style={styles.td}>{b.marker_name}</td>
                        <td style={{ ...styles.td, fontWeight: 600 }}>{b.value}</td>
                        <td style={styles.td}>{b.unit}</td>
                        <td style={styles.td}>
                          <span style={getStatusBadge(b.status)}>{b.status}</span>
                        </td>
                        <td style={styles.td}>{b.marker_category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Wearable Data */}
          {userData.userData.wearableData.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>⌚ Recent Wearable Data (Last 7 Days)</h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Steps</th>
                      <th style={styles.th}>Resting HR</th>
                      <th style={styles.th}>HRV</th>
                      <th style={styles.th}>Sleep</th>
                      <th style={styles.th}>SpO2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userData.userData.wearableData.slice(0, 7).map((w: any) => (
                      <tr key={w.id} style={styles.tr}>
                        <td style={styles.td}>{w.date}</td>
                        <td style={styles.td}>{w.steps || '-'}</td>
                        <td style={styles.td}>{w.resting_hr || '-'}</td>
                        <td style={styles.td}>{w.hrv_rmssd || '-'}</td>
                        <td style={styles.td}>{w.sleep_hours ? `${w.sleep_hours}h` : '-'}</td>
                        <td style={styles.td}>{w.spo2_avg ? `${w.spo2_avg}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Genomic Summary */}
          {userData.userData.genomicSummary.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>🧬 Genomic Summary</h3>
              {userData.userData.genomicSummary.map((g: any) => (
                <div key={g.id} style={styles.genomicCard}>
                  <div style={styles.genomicRow}>
                    <strong>APOE4:</strong> {g.apoe4_present ? "Present ⚠️" : "Not Present ✅"}
                  </div>
                  <div style={styles.genomicRow}>
                    <strong>MTHFR Variant:</strong> {g.mthfr_variant !== null ? `Type ${g.mthfr_variant}` : "Unknown"}
                  </div>
                  <div style={styles.genomicRow}>
                    <strong>CVD Risk Score:</strong> {g.polygenic_score_cvd?.toFixed(2) || "N/A"}
                  </div>
                  <div style={styles.genomicRow}>
                    <strong>Processed:</strong> {new Date(g.processed_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Medications */}
          {userData.userData.medications.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}>💊 Medications & Supplements</h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Dose</th>
                      <th style={styles.th}>Frequency</th>
                      <th style={styles.th}>Start Date</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userData.userData.medications.slice(0, 10).map((m: any) => (
                      <tr key={m.id} style={styles.tr}>
                        <td style={styles.td}>{m.name}</td>
                        <td style={styles.td}>{m.dose || '-'}</td>
                        <td style={styles.td}>{m.frequency || '-'}</td>
                        <td style={styles.td}>{m.start_date}</td>
                        <td style={styles.td}>
                          {m.end_date ? `Ended ${m.end_date}` : '✅ Active'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Raw JSON */}
          <div style={styles.card}>
            <details>
              <summary style={styles.detailsSummary}>
                🔍 View Complete Raw Data (JSON)
              </summary>
              <pre style={styles.jsonPre}>
                {JSON.stringify(userData, null, 2)}
              </pre>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { 
    width: "100%"
  },
  card: { 
    background: "#0b1020", 
    padding: "1.5rem", 
    marginTop: "1.5rem", 
    borderRadius: "12px", 
    border: "1px solid rgba(255,255,255,0.1)" 
  },
  btn: { 
    background: "#007bff", 
    border: "none", 
    borderRadius: "8px", 
    padding: "1rem 2rem", 
    color: "#fff", 
    cursor: "pointer", 
    fontWeight: 600, 
    fontSize: "1rem",
    width: "100%"
  },
  btnDisabled: { 
    background: "#555", 
    border: "none", 
    borderRadius: "8px", 
    padding: "1rem 2rem", 
    color: "#fff", 
    cursor: "not-allowed", 
    fontWeight: 600, 
    fontSize: "1rem", 
    opacity: 0.5,
    width: "100%"
  },
  errorBox: { 
    padding: "0.875rem", 
    background: "#3a1a1a", 
    border: "1px solid #5a2a2a", 
    borderRadius: "8px", 
    marginTop: "1rem", 
    color: "#ff6b6b" 
  },
  summaryGrid: { 
    display: "grid", 
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", 
    gap: "1rem", 
    marginTop: "1.5rem" 
  },
  summaryCard: { 
    background: "#050816", 
    padding: "1.5rem", 
    borderRadius: "12px", 
    border: "1px solid rgba(255,255,255,0.1)", 
    textAlign: "center" as const,
    transition: "transform 0.2s",
    cursor: "default"
  },
  summaryIcon: { 
    fontSize: "2.5rem", 
    marginBottom: "0.75rem" 
  },
  summaryValue: { 
    fontSize: "2.5rem", 
    fontWeight: 700, 
    color: "#007bff", 
    marginBottom: "0.5rem" 
  },
  summaryLabel: { 
    fontSize: "0.9rem", 
    color: "#888",
    fontWeight: 500
  },
  profileGrid: { 
    display: "grid", 
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
    gap: "1rem", 
    padding: "1rem", 
    background: "#050816", 
    borderRadius: "8px", 
    fontSize: "0.95rem" 
  },
  tableContainer: { 
    overflowX: "auto" as const, 
    marginTop: "1rem" 
  },
  table: { 
    width: "100%", 
    borderCollapse: "collapse" as const, 
    fontSize: "0.9rem" 
  },
  th: { 
    padding: "0.75rem", 
    textAlign: "left" as const, 
    borderBottom: "2px solid #444", 
    color: "#aaa", 
    fontWeight: 600 
  },
  td: { 
    padding: "0.75rem", 
    borderBottom: "1px solid #333" 
  },
  tr: { 
    transition: "background 0.2s" 
  },
  genomicCard: { 
    background: "#050816", 
    padding: "1rem", 
    borderRadius: "8px", 
    marginTop: "1rem" 
  },
  genomicRow: { 
    padding: "0.5rem 0", 
    borderBottom: "1px solid #222",
    fontSize: "0.95rem"
  },
  detailsSummary: { 
    cursor: "pointer", 
    fontWeight: 600, 
    padding: "0.75rem", 
    background: "#050816", 
    borderRadius: "8px",
    userSelect: "none" as const
  },
  jsonPre: { 
    marginTop: "1rem", 
    padding: "1rem", 
    background: "#050816", 
    borderRadius: "8px", 
    overflow: "auto",
    fontSize: "0.75rem",
    textAlign: "left" as const,
    maxHeight: "500px"
  }
};