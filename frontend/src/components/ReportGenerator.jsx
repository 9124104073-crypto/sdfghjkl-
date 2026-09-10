import { FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const scoreTone = (score) => (score >= 80 ? [5, 150, 105] : score >= 60 ? [234, 139, 31] : [220, 38, 38]);
const cleanFileName = (value) => String(value || "Site").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");

export default function ReportGenerator({ site, climateActive = false }) {
  function download() {
    if (!site) return;
    const doc = new jsPDF();
    const score = Number(site.score) || 0;
    const [red, green, blue] = scoreTone(score);
    const factors = site.factors || [];
    const findFactor = (terms) => factors.find((factor) => terms.some((term) => factor.name?.toLowerCase().includes(term) || factor.label?.toLowerCase().includes(term)));
    const factorRows = [
      ["Population Coverage", findFactor(["population"])?.normalized ?? "-", "Planning catchment"],
      ["Road Accessibility", findFactor(["accessibility", "road"])?.normalized ?? "-", "Network access"],
      ["Flood Safety", findFactor(["flood"])?.normalized ?? "-", climateActive ? "2050 scenario applied" : "Current scenario"],
      ["Terrain Suitability", findFactor(["terrain"])?.normalized ?? "-", "Land and elevation"],
    ];
    const generated = new Date().toLocaleString();

    doc.setFillColor(11, 31, 51);
    doc.rect(0, 0, 210, 31, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("NIRMAN AI - Infrastructure Planning Report", 15, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated ${generated}`, 15, 25);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(site.site_name || site.name, 15, 44);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Risk assessment: ${site.risk?.overall_level || site.risk || "Not assessed"}${climateActive ? " | 2050 climate scenario active" : ""}`, 15, 51);

    doc.setFillColor(red, green, blue);
    doc.roundedRect(15, 59, 58, 27, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SUITABILITY SCORE", 20, 69);
    doc.setFontSize(20);
    doc.text(`${score.toFixed(1)} / 100`, 20, 80);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.text("Planning factor assessment", 15, 101);
    autoTable(doc, {
      startY: 106,
      head: [["Factor", "Score / 100", "Assessment basis"]],
      body: factorRows,
      theme: "grid",
      headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    const nextY = doc.lastAutoTable.finalY + 13;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("AI Recommendation", 15, nextY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const explanation = site.aiExplanation || site.explanation || `This site is ranked ${site.recommendation || "for review"} based on the current planning factors.`;
    doc.text(doc.splitTextToSize(explanation, 180), 15, nextY + 8);

    doc.setDrawColor(203, 213, 225);
    doc.line(15, 276, 195, 276);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.text("This is a decision-support tool. Final approval requires certified engineering assessment.", 15, 282);
    doc.save(`NIRMAN_Report_${cleanFileName(site.site_name || site.name)}.pdf`);
  }

  return (
    <div className="flex justify-center">
      <button type="button" disabled={!site} onClick={download} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
        <FileDown size={17} /> Download Planning Report (PDF)
      </button>
    </div>
  );
}
