/* ---------------- REPORTE DE CIERRE (.docx descargable, sin backend) ---------------- */

function docxCell(text, opts){
  opts = opts || {};
  return new docx.TableCell({
    width: opts.width ? { size: opts.width, type: docx.WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: '17335A' } : undefined,
    children: [ new docx.Paragraph({
      children: [ new docx.TextRun({ text: String(text), bold: !!opts.header, color: opts.header ? 'FFFFFF' : undefined, size: 20 }) ],
    }) ],
  });
}

function docxSummaryLine(label, value){
  return new docx.Paragraph({
    spacing: { after: 60 },
    children: [
      new docx.TextRun({ text: label + ': ', bold: true, size: 21 }),
      new docx.TextRun({ text: String(value), size: 21 }),
    ],
  });
}

function buildClosureReportDoc(ev){
  const c = ev.closure;
  const valid = ev.orders.filter(o=> !o.voided);
  const voided = ev.orders.filter(o=> o.voided);
  const fondo = c.fondoInicial || 0;
  const esperadoEnCaja = c.efectivoEsperado + fondo;
  const children = [];

  children.push(new docx.Paragraph({
    heading: docx.HeadingLevel.HEADING_1,
    children: [ new docx.TextRun({ text: "Harumimi's Coffee", color: '17335A' }) ],
  }));
  children.push(new docx.Paragraph({
    spacing: { after: 120 },
    children: [ new docx.TextRun({ text: 'Reporte de cierre', italics: true, color: '5B6E8C', size: 22 }) ],
  }));
  children.push(new docx.Paragraph({
    heading: docx.HeadingLevel.HEADING_2,
    children: [ new docx.TextRun({ text: ev.eventName || c.eventName || ('Evento #' + ev.sessionId) }) ],
  }));
  children.push(new docx.Paragraph({
    spacing: { after: 200 },
    children: [ new docx.TextRun({ text: `Cerrado: ${dateFmt(c.closedAt)}`, size: 21 }) ],
  }));

  children.push(new docx.Paragraph({
    heading: docx.HeadingLevel.HEADING_2,
    spacing: { before: 120, after: 100 },
    children: [ new docx.TextRun({ text: 'Pedidos' }) ],
  }));

  if(valid.length===0){
    children.push(new docx.Paragraph({ children: [ new docx.TextRun({ text: '(sin pedidos válidos)', italics: true }) ] }));
  } else {
    const rows = [ new docx.TableRow({
      tableHeader: true,
      children: [
        docxCell('Hora', { header:true, width:12 }),
        docxCell('Cliente', { header:true, width:22 }),
        docxCell('Método', { header:true, width:16 }),
        docxCell('Ítems', { header:true, width:36 }),
        docxCell('Total', { header:true, width:14 }),
      ],
    }) ];
    valid.forEach(o=>{
      const itemsTxt = o.items.map(i=> `${i.qty}x ${i.name}`).join(', ');
      const metodo = o.method==='efectivo' ? 'Efectivo' : 'Transferencia';
      rows.push(new docx.TableRow({ children: [
        docxCell(timeFmt(o.timestamp), { width:12 }),
        docxCell(o.customerName || 'Sin nombre', { width:22 }),
        docxCell(metodo, { width:16 }),
        docxCell(itemsTxt, { width:36 }),
        docxCell(fmt(o.total), { width:14 }),
      ]}));
    });
    children.push(new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      rows,
    }));
  }

  if(voided.length>0){
    children.push(new docx.Paragraph({
      spacing: { before: 120 },
      children: [ new docx.TextRun({ text: `Anulados (no suman al total): ${voided.length}`, italics: true, color: 'D6524A' }) ],
    }));
  }

  children.push(new docx.Paragraph({
    heading: docx.HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    children: [ new docx.TextRun({ text: 'Resumen' }) ],
  }));

  children.push(docxSummaryLine('Pedidos válidos', c.count));
  children.push(docxSummaryLine('Efectivo esperado (ventas)', fmt(c.efectivoEsperado)));
  children.push(docxSummaryLine('Fondo inicial', fmt(fondo)));
  children.push(docxSummaryLine('Total esperado en caja', fmt(esperadoEnCaja)));
  children.push(docxSummaryLine('Transferencia', fmt(c.transferencia)));
  children.push(docxSummaryLine('Total recaudado (ventas)', fmt(c.grand)));
  children.push(docxSummaryLine('Efectivo contado', fmt(c.efectivoContado)));
  children.push(new docx.Paragraph({
    spacing: { before: 60 },
    children: [
      new docx.TextRun({ text: 'Diferencia: ', bold: true, size: 21 }),
      new docx.TextRun({
        text: c.diferencia===0 ? 'cuadró perfecto' : fmt(c.diferencia),
        bold: true, size: 21,
        color: c.diferencia===0 ? '3E9C6E' : 'D6524A',
      }),
    ],
  }));

  children.push(new docx.Paragraph({
    spacing: { before: 400 },
    children: [ new docx.TextRun({ text: "Generado por la app de caja — Harumimi's Coffee", italics: true, size: 18, color: '5B6E8C' }) ],
  }));

  return new docx.Document({ sections: [{ children }] });
}

function slugify(str){
  return String(str||'')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function downloadClosureReport(ev){
  const doc = buildClosureReportDoc(ev);
  let blob;
  try{
    blob = await docx.Packer.toBlob(doc);
  }catch(e){
    console.error('No se pudo generar el reporte', e);
    showToast('⚠️ No se pudo generar el reporte .docx', { error:true, duration:4000 });
    return;
  }
  const url = URL.createObjectURL(blob);
  const name = ev.eventName || (ev.closure && ev.closure.eventName);
  const slug = slugify(name) || ('evento-' + ev.sessionId);
  const a = document.createElement('a');
  a.href = url;
  a.download = `harumimis-coffee-cierre-${slug}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}
