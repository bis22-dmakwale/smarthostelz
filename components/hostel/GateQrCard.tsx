"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Printer } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useApiResource } from "@/components/hostel/useApiResource";

type GateCode = { id: string; code: string; name: string };

export default function GateQrCard() {
  const { data, error, loading } = useApiResource<GateCode[]>("/api/gate/code");
  const [images, setImages] = useState<Record<string, string>>({});
  const [pdfError, setPdfError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");

  useEffect(() => {
    if (!data?.length) return;
    let active = true;
    import("qrcode").then(async ({ default: QRCode }) => {
      const entries = await Promise.all(data.map(async (gate) => [gate.id, await QRCode.toDataURL(gate.code, {
        width: 420, margin: 2, errorCorrectionLevel: "H",
      })] as const));
      if (active) setImages(Object.fromEntries(entries));
    }).catch((cause: unknown) => {
      if (active) setPdfError(cause instanceof Error ? cause.message : "Unable to prepare hostel QR codes.");
    });
    return () => { active = false; };
  }, [data]);

  async function downloadPoster(gate: GateCode, image: string) {
    if (!image) return;
    setDownloadingId(gate.id);
    setPdfError("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      pdf.setProperties({ title: `MUBAS ${gate.name} Gate QR Poster`, subject: gate.name });
      pdf.setFillColor(36, 38, 95);
      pdf.rect(0, 0, 210, 45, "F");
      pdf.setFillColor(22, 143, 202);
      pdf.rect(0, 45, 210, 3, "F");
      const crestResponse = await fetch("/logo-white.png");
      const crestBlob = await crestResponse.blob();
      const crest = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to load MUBAS crest."));
        reader.onerror = () => reject(new Error("Unable to load MUBAS crest."));
        reader.readAsDataURL(crestBlob);
      });
      pdf.addImage(crest, "PNG", 12, 9, 27, 27);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text("MUBAS HOSTEL GATE", 105, 20, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      pdf.text(gate.name, 105, 31, { align: "center" });
      pdf.setTextColor(36, 38, 95);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.text("STUDENT CHECK-IN / CHECK-OUT", 105, 62, { align: "center" });
      pdf.addImage(image, "PNG", 47.5, 74, 115, 115);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text("Scan this code in the MUBAS Student Portal", 105, 204, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text("Select Check in or Check out, then allow camera access.", 105, 213, { align: "center" });
      pdf.setFillColor(240, 217, 139);
      pdf.rect(0, 275, 210, 22, "F");
      pdf.setTextColor(36, 38, 95);
      pdf.setFontSize(9);
      pdf.text("Malawi University of Business and Applied Sciences", 105, 288, { align: "center" });
      const safeName = gate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      pdf.save(`mubas-${safeName}-gate-qr.pdf`);
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "Unable to create the gate poster PDF.");
    } finally {
      setDownloadingId("");
    }
  }

  return <Card className="gate-qr-print">
    <div className="gate-qr-heading"><div><p className="page-eyebrow">Gate access</p><h2 className="section-title" style={{ margin: 0 }}>Official hostel entrance QR codes</h2></div></div>
    <p className="muted" style={{ marginTop: 7 }}>Students scan this code from their portal to record check-in or check-out.</p>
    {error && <p role="alert" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
    {loading && <p className="muted" style={{ marginTop: 12 }}>Loading hostel gate QR codes…</p>}
    {data?.map((gate) => images[gate.id] && <div key={gate.id} className="gate-qr-content">
      <Image src={images[gate.id]} alt={`${gate.name} gate QR code`} width={260} height={260} unoptimized />
      <div className="gate-qr-copy"><strong>{gate.name}</strong><p className="muted">Students assigned to {gate.name} scan this poster from the Student Portal.</p><div className="gate-qr-actions no-print"><Button onClick={() => void downloadPoster(gate, images[gate.id])} disabled={downloadingId === gate.id}><Download size={16} /> {downloadingId === gate.id ? "Preparing PDF…" : `Download ${gate.name} PDF`}</Button><Button variant="ghost" onClick={() => window.print()}><Printer size={16} /> Print posters</Button></div></div>
    </div>)}
    {!loading && !error && !data?.length && <p className="muted" style={{ marginTop: 12 }}>Add active hostels and rooms to generate gate posters.</p>}
    {pdfError && <p role="alert" className="no-print" style={{ color: "var(--danger)", marginTop: 10 }}>{pdfError}</p>}
  </Card>;
}