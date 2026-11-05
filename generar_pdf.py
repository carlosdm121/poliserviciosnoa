#!/usr/bin/env python3
# Genera PDF paso a paso para configurar Supabase, Mercado Pago y WhatsApp
# Estilo: explicado muy simple (como para un niño de 5 años)

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    ListFlowable, ListItem, HRFlowable
)

# Colores suaves y amigables
AZUL = HexColor("#4A90E2")
VERDE = HexColor("#25D366")
AMARILLO = HexColor("#FFD166")
ROJO = HexColor("#E63946")
GRIS_CLARO = HexColor("#F4F4F4")
GRIS_OSCURO = HexColor("#333333")

styles = getSampleStyleSheet()

titulo_style = ParagraphStyle(
    "titulo", parent=styles["Title"],
    fontSize=26, textColor=AZUL, spaceAfter=10, alignment=1
)

subtitulo_style = ParagraphStyle(
    "subtitulo", parent=styles["Heading2"],
    fontSize=16, textColor=VERDE, spaceAfter=8
)

paso_style = ParagraphStyle(
    "paso", parent=styles["Heading3"],
    fontSize=14, textColor=ROJO, spaceBefore=14, spaceAfter=6
)

texto_style = ParagraphStyle(
    "texto", parent=styles["Normal"],
    fontSize=11, textColor=GRIS_OSCURO, leading=16, spaceAfter=6
)

bala_style = ParagraphStyle(
    "bala", parent=styles["Normal"],
    fontSize=10.5, textColor=GRIS_OSCURO, leading=14, leftIndent=14, spaceAfter=3
)

caja_style = ParagraphStyle(
    "caja", parent=styles["Normal"],
    fontSize=10, textColor=GRIS_OSCURO, leading=13,
    backColor=GRIS_CLARO, borderPadding=8, spaceAfter=8
)

def seccion_titulo(texto):
    return Paragraph(texto, subtitulo_style)

def seccion_paso(texto):
    return Paragraph(texto, paso_style)

def parrafo(texto):
    return Paragraph(texto, texto_style)

def bala(texto):
    return Paragraph("• " + texto, bala_style)

story = []

# ================= PORTADA =================
story.append(Spacer(1, 0.5*inch))
story.append(Paragraph("POLISERVICIOS NOA", ParagraphStyle(
    "portada_titulo", parent=styles["Title"], fontSize=40, textColor=AZUL, alignment=1, spaceAfter=6
)))
story.append(Paragraph("Tu base de datos en Supabase — paso a paso", ParagraphStyle(
    "portada_sub", parent=styles["Heading2"], fontSize=18, textColor=VERDE, alignment=1, spaceAfter=4
)))
story.append(Spacer(1, 0.3*inch))
story.append(Paragraph(
    "Esta guía te dice qué hacer, paso por paso, como si tuvieras 5 años. "
    "No hace falta saber programar. Solo sigue cada paso en orden.",
    ParagraphStyle("portada_texto", parent=styles["Normal"], fontSize=13, alignment=1, textColor=GRIS_OSCURO)
))
story.append(Spacer(1, 0.4*inch))
story.append(HRFlowable(width="80%", thickness=2, color=AMARILLO, spaceAfter=20))
story.append(Paragraph("¿Qué vamos a hacer?", subtitulo_style))
for item in [
    "Crear una base de datos en Supabase (como guardar tus juguetes en una caja etiquetada).",
    "Copiar y pegar un archivo con todas las reglas de la base de datos.",
    "Configurar Mercado Pago para cobrar la suscripción mensual.",
    "Configurar WhatsApp para verificar que el dueño del número es real.",
    "Subir todo a GitHub para que no se pierda."
]:
    story.append(bala(item))
story.append(PageBreak())

# ================= INTRO =================
story.append(seccion_titulo("Antes de empezar"))
story.append(parrafo(
    "Imaginá que tu proyecto es una librería. Necesitás una estantería donde guardar los libros. "
    "Esa estantería se llama <b>base de datos</b>. Y vamos a ponerla en un lugar llamado <b>Supabase</b>, "
    "que es como un almacén en internet que cuida tus datos gratis (hasta cierto límite)."
))
story.append(parrafo(
    "También vamos a conectar dos cosas más: <b>Mercado Pago</b> (para que la gente te pague) y "
    "<b>WhatsApp</b> (para verificar que los números de teléfono son de verdad)."
))
story.append(Spacer(1, 0.2*inch))
story.append(HRFlowable(width="100%", thickness=1, color=GRIS_CLARO))
story.append(PageBreak())

# ================= PASO 1: CUENTA SUPABASE =================
story.append(seccion_paso("Paso 1: Crear tu cuenta en Supabase"))
story.append(parrafo("1. Abrí tu navegador (Chrome, Firefox o el que uses)."))
story.append(parrafo("2. Entrá a <b>supabase.com</b>."))
story.append(parrafo("3. Hacé clic en el botón que dice <i>Start your project</i> o <i>Sign in</i>."))
story.append(parrafo("4. Podés entrar con tu cuenta de GitHub. Así no tenés que recordar otra contraseña."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("¿Qué vas a ver?", subtitulo_style))
story.append(parrafo("Después de entrar, verás un panel con un botón que dice <i>New Project</i>. Ese es el primer botón que vas a apretar."))
story.append(PageBreak())

# ================= PASO 2: PROYECTO =================
story.append(seccion_paso("Paso 2: Crear el proyecto"))
story.append(parrafo("1. Hacé clic en <i>New Project</i>."))
story.append(parrafo("2. Elegí un nombre para el proyecto, por ejemplo: <b>poliservicios-noa</b>."))
story.append(parrafo("3. Elegí una contraseña para la base de datos. Anotala en un papel o guárdala en tu gestor de contraseñas. No la compartas con nadie."))
story.append(parrafo("4. Elegí la región más cercana a vos (por ejemplo, <i>South America</i> si estás en Argentina)."))
story.append(parrafo("5. Hacé clic en <i>Create new project</i> y esperá un poquito. Supabase está preparando tu estantería."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Cuando termine, verás un panel con varias opciones a la izquierda.", texto_style))
story.append(PageBreak())

# ================= PASO 3: SQL EDITOR =================
story.append(seccion_paso("Paso 3: Pegar la base de datos (el SQL)"))
story.append(parrafo("En la carpeta de tu proyecto hay un archivo llamado <b>supabase/schema.sql</b>. Ese archivo tiene todas las reglas de la base de datos escritas en un lenguaje llamado SQL."))
story.append(parrafo("1. En el panel de Supabase, a la izquierda, buscá la opción que dice <b>SQL Editor</b>."))
story.append(parrafo("2. Hacé clic en <i>New query</i>."))
story.append(parrafo("3. Abrí el archivo <b>supabase/schema.sql</b> con el bloc de notas o cualquier editor de texto."))
story.append(parrafo("4. Copiá TODO el contenido del archivo."))
story.append(parrafo("5. Pegalo en el recuadro en blanco de Supabase."))
story.append(parrafo("6. Hacé clic en el botón <b>Run</b> (o <b>Ejecutar</b>)."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Si todo sale bien, verás un mensaje que dice que la consulta se ejecutó correctamente.", texto_style))
story.append(parrafo("Esto crea todas las tablas: usuarios, perfiles, categorías, pagos, facturas, cupones, reclamos, tickets de soporte, etc."))
story.append(PageBreak())

# ================= PASO 4: SEED =================
story.append(seccion_paso("Paso 4: Cargar datos iniciales (seed)"))
story.append(parrafo("Ahora vamos a poner algunos datos de ejemplo para que la base no empiece vacía."))
story.append(parrafo("1. En el mismo <b>SQL Editor</b>, hacé clic en <i>New query</i> otra vez."))
story.append(parrafo("2. Abrí el archivo <b>supabase/seed.sql</b>."))
story.append(parrafo("3. Copiá TODO el contenido."))
story.append(parrafo("4. Pegalo en Supabase."))
story.append(parrafo("5. Hacé clic en <b>Run</b>."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Esto crea los planes de suscripción (Básico y Premium) y algunos ajustes del sitio.", texto_style))
story.append(PageBreak())

# ================= PASO 5: SECRETS =================
story.append(seccion_paso("Paso 5: Guardar las claves secretas (Secrets)"))
story.append(parrafo("Supabase necesita saber algunas claves secretas para que Mercado Pago y WhatsApp funcionen. Estas claves no se suben a GitHub porque son secretas."))
story.append(parrafo("1. En el panel de Supabase, a la izquierda, buscá <b>Project Settings</b>."))
story.append(parrafo("2. Dentro, buscá la sección que dice <b>Edge Functions</b> o <b>Secrets</b>."))
story.append(parrafo("3. Agregá estas claves una por una:"))
for clave, desc in [
    ("SB_URL", "La dirección de tu proyecto en Supabase (la ves en la barra de direcciones del navegador)"),
    ("SB_SERVICE_ROLE", "Una clave maestra que permite hacer cambios importantes (se genera en Supabase)"),
    ("MP_ACCESS_TOKEN", "Tu token de Mercado Pago para recibir pagos"),
    ("WHATSAPP_WEBHOOK_SECRET", "Una clave para verificar que los mensajes de WhatsApp son reales"),
    ("ADMIN_API_KEY", "Una clave para bloquear perfiles desde el panel de administración")
]:
    story.append(bala(f"<b>{clave}</b>: {desc}"))
story.append(Spacer(1, 0.15*inch))
story.append(parrafo("Hacé clic en <i>Save</i> o <i>Guardar</i> después de agregar cada una."))
story.append(PageBreak())

# ================= PASO 6: EDGE FUNCTIONS =================
story.append(seccion_paso("Paso 6: Subir las Edge Functions"))
story.append(parrafo("Las Edge Functions son como ayudantes que viven en Supabase y hacen cosas automáticamente."))
story.append(parrafo("1. En el panel de Supabase, buscá <b>Edge Functions</b> a la izquierda."))
story.append(parrafo("2. Creá tres funciones nuevas con estos nombres:"))
for fn, desc in [
    ("webhook-mp", "Recibe los avisos de Mercado Pago cuando alguien paga"),
    ("webhook-kyc", "Recibe los avisos de WhatsApp para verificar números"),
    ("admin-bloquear", "Permite bloquear perfiles que hagan trampa")
]:
    story.append(bala(f"<b>{fn}</b>: {desc}"))
story.append(parrafo("3. En cada función, pegá el código que está en la carpeta <b>supabase/functions/[nombre]/index.ts</b>."))
story.append(parrafo("4. Guardá cada función y hacé clic en <i>Deploy</i>."))
story.append(PageBreak())

# ================= PASO 7: MERCADO PAGO =================
story.append(seccion_paso("Paso 7: Conectar Mercado Pago"))
story.append(parrafo("Mercado Pago necesita saber dónde enviar los avisos cuando alguien paga la suscripción."))
story.append(parrafo("1. Entrá a tu cuenta de Mercado Pago (desarrolladores)."))
story.append(parrafo("2. Buscá la sección de <b>Webhooks</b> o <i>Notificaciones</i>."))
story.append(parrafo("3. Agregá una URL de notificación. Esa URL es la dirección de tu Edge Function <b>webhook-mp</b>."))
story.append(parrafo("   Se ve algo como: <i>https://tu-proyecto.supabase.co/functions/v1/webhook-mp</i>"))
story.append(parrafo("4. Guardá los cambios."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Ahora, cuando alguien pague, Mercado Pago le avisará a tu base de datos y se activará la suscripción automáticamente.", texto_style))
story.append(PageBreak())

# ================= PASO 8: WHATSAPP =================
story.append(seccion_paso("Paso 8: Conectar WhatsApp (Meta)"))
story.append(parrafo("WhatsApp sirve para verificar que el profesional es dueño del número de teléfono que dice."))
story.append(parrafo("1. Entrá a <b>Meta for Developers</b> (developers.facebook.com)."))
story.append(parrafo("2. Creá una aplicación de <b>WhatsApp</b> o usá la API de WhatsApp Cloud."))
story.append(parrafo("3. Configurá un <b>webhook</b> para recibir mensajes."))
story.append(parrafo("4. La URL del webhook es tu Edge Function <b>webhook-kyc</b>:"))
story.append(parrafo("   <i>https://tu-proyecto.supabase.co/functions/v1/webhook-kyc</i>"))
story.append(parrafo("5. Guardá el <b>Webhook Secret</b> en los Secrets de Supabase (lo hiciste en el Paso 5)."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Así, cuando el profesional envíe un código por WhatsApp, tu base sabrá que es el número real.", texto_style))
story.append(PageBreak())

# ================= PASO 9: GITHUB =================
story.append(seccion_paso("Paso 9: Subir todo a GitHub"))
story.append(parrafo("GitHub es como una mochila donde guardas tu trabajo para que no se pierda y puedas bajarlo en otra computadora."))
story.append(parrafo("1. Abrí la terminal o símbolo del sistema en la carpeta del proyecto."))
story.append(parrafo("2. Escribí estos comandos uno por uno:"))
for cmd in [
    "git add supabase/",
    "git commit -m \"feat: agregar esquema y funciones de Supabase\"",
    "git push origin main"
]:
    story.append(bala(f"<code>{cmd}</code>"))
story.append(Spacer(1, 0.15*inch))
story.append(parrafo("Si te pide usuario y contraseña de GitHub, usá tu usuario y un <i>token de acceso personal</i> (no tu contraseña normal)."))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Listo. Ahora todo tu trabajo está guardado en github.com/carlosdm121/poliserviciosnoa", texto_style))
story.append(PageBreak())

# ================= RESUMEN =================
story.append(seccion_titulo("Resumen rápido"))
story.append(parrafo("¿Qué hicimos?"))
for item in [
    "Creamos la base de datos en Supabase (paso 1 y 2).",
    "Pegamos las reglas de la base de datos con el archivo schema.sql (paso 3).",
    "Cargamos datos de ejemplo con seed.sql (paso 4).",
    "Guardamos claves secretas para Mercado Pago y WhatsApp (paso 5).",
    "Subimos las funciones automáticas (paso 6).",
    "Conectamos Mercado Pago para cobrar (paso 7).",
    "Conectamos WhatsApp para verificar teléfonos (paso 8).",
    "Subimos todo a GitHub para no perderlo (paso 9)."
]:
    story.append(bala(item))
story.append(Spacer(1, 0.3*inch))
story.append(HRFlowable(width="100%", thickness=1, color=GRIS_CLARO))
story.append(Paragraph("¡Listo! Tu base de datos está lista para usarse.", ParagraphStyle(
    "final", parent=styles["Normal"], fontSize=13, textColor=VERDE, alignment=1, spaceBefore=10
)))

doc = SimpleDocTemplate("supabase/Guia_Paso_a_Paso_Supabase.pdf", pagesize=letter,
                        leftMargin=0.8*inch, rightMargin=0.8*inch,
                        topMargin=0.8*inch, bottomMargin=0.8*inch,
                        title="Poliservicios NOA - Guia Supabase",
                        author="Poliservicios NOA")
doc.build(story)
print("PDF generado: supabase/Guia_Paso_a_Paso_Supabase.pdf")
