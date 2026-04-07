import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

/* ── Types (shared with page.tsx) ── */

interface WorkExperience {
  jobTitle: string;
  company: string;
  country: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
}

interface Education {
  degree: string;
  institution: string;
  field: string;
  graduationDate: string;
  grade: string;
}

interface LanguageSkill {
  language: string;
  proficiency: string;
}

interface CVData {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  currentLocation: string;
  headline: string;
  linkedin: string;
  portfolio: string;
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  languages: LanguageSkill[];
  certifications: string[];
}

/* ── Styles ── */

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 16,
    borderBottom: "1.5pt solid #2563eb",
    paddingBottom: 12,
  },
  name: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 4,
  },
  headline: {
    fontSize: 10,
    color: "#4b5563",
    marginBottom: 6,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    fontSize: 9,
    color: "#6b7280",
  },
  linkRow: {
    flexDirection: "row",
    gap: 12,
    fontSize: 9,
    color: "#2563eb",
    marginTop: 3,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottom: "0.75pt solid #d1d5db",
    paddingBottom: 3,
    marginBottom: 8,
  },
  expItem: {
    marginBottom: 10,
  },
  expHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  expTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  expCompany: {
    fontSize: 9,
    color: "#4b5563",
  },
  expDate: {
    fontSize: 9,
    color: "#6b7280",
  },
  expDesc: {
    fontSize: 9,
    color: "#4b5563",
    marginTop: 3,
  },
  eduItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  eduDegree: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  eduInst: {
    fontSize: 9,
    color: "#4b5563",
  },
  eduGrade: {
    fontSize: 9,
    color: "#6b7280",
  },
  skillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skillBadge: {
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    color: "#374151",
  },
  langRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  langItem: {
    fontSize: 9,
    color: "#374151",
  },
  langLevel: {
    color: "#6b7280",
  },
  certItem: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 2,
  },
});

/* ── Document ── */

export function CVDocument({ data }: { data: CVData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{data.fullName || "Your Name"}</Text>
          {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}
          <View style={styles.contactRow}>
            {data.email ? <Text>{data.email}</Text> : null}
            {data.phone ? <Text>{data.phone}</Text> : null}
            {data.currentLocation ? <Text>{data.currentLocation}</Text> : null}
            {data.nationality ? <Text>{data.nationality}</Text> : null}
          </View>
          {(data.linkedin || data.portfolio) && (
            <View style={styles.linkRow}>
              {data.linkedin ? <Text>{data.linkedin}</Text> : null}
              {data.portfolio ? <Text>{data.portfolio}</Text> : null}
            </View>
          )}
        </View>

        {/* Experience */}
        {data.experience.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {data.experience.map((exp, i) => (
              <View key={i} style={styles.expItem}>
                <View style={styles.expHeader}>
                  <View>
                    <Text style={styles.expTitle}>{exp.jobTitle}</Text>
                    <Text style={styles.expCompany}>
                      {exp.company}{exp.country ? ` · ${exp.country}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.expDate}>
                    {exp.startDate} – {exp.isCurrent ? "Present" : exp.endDate}
                  </Text>
                </View>
                {exp.description ? (
                  <Text style={styles.expDesc}>{exp.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {data.education.map((edu, i) => (
              <View key={i} style={styles.eduItem}>
                <View>
                  <Text style={styles.eduDegree}>
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ""}
                  </Text>
                  <Text style={styles.eduInst}>{edu.institution}</Text>
                  {edu.grade ? <Text style={styles.eduGrade}>Grade: {edu.grade}</Text> : null}
                </View>
                {edu.graduationDate ? (
                  <Text style={styles.expDate}>{edu.graduationDate}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsRow}>
              {data.skills.map((s, i) => (
                <Text key={i} style={styles.skillBadge}>{s}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Languages */}
        {data.languages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Languages</Text>
            <View style={styles.langRow}>
              {data.languages.map((l, i) => (
                <Text key={i} style={styles.langItem}>
                  {l.language} <Text style={styles.langLevel}>({l.proficiency})</Text>
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            {data.certifications.map((c, i) => (
              <Text key={i} style={styles.certItem}>• {c}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
