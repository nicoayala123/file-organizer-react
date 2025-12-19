import { useState } from 'react'
import './App.css'
import * as pdfjsLib from 'pdfjs-dist'

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

function App() {
  const [status, setStatus] = useState('')
  const [filesFound, setFilesFound] = useState([])
  const [pdfFiles, setPdfFiles] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState('html') // 'html' o 'pdf'

  // Función para extraer texto del PDF
  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let fullText = ''

      // Extraer texto de todas las páginas
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map(item => item.str).join(' ')
        fullText += pageText + ' '
      }

      return fullText
    } catch (error) {
      console.error('Error extrayendo texto del PDF:', error)
      return ''
    }
  }

  // Función para obtener el nombre del mes
  const getMonthName = (monthNumber) => {
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ]
    const monthIndex = parseInt(monthNumber) - 1
    return months[monthIndex] || ''
  }

  // Función para extraer datos del texto del PDF
  const extractDataFromText = (text) => {
    const data = {
      date: '',
      month: '',
      monthName: '',
      consecutive: '',
      clientName: '',
      invoiceNumber: ''
    }

    // Limpiar texto: eliminar saltos de línea y espacios múltiples
    const cleanText = text.replace(/\s+/g, ' ').trim()

    // Buscar número de factura electrónica
    // Patrones: "Factura Electrónica N° 1001", "FE1001", "FE 1001", etc.
    const invoicePatterns = [
      /Factura\s+Electrónica\s+N°?\s*[:\s]*(\d+)/i,
      /Factura\s+Electronica\s+N°?\s*[:\s]*(\d+)/i,
      /N°?\s*Factura[:\s]+(\d+)/i,
      /FE[\s-]?(\d+)/i,
      /Número\s+de\s+Factura[:\s]+(\d+)/i,
    ]

    for (const pattern of invoicePatterns) {
      const invoiceMatch = cleanText.match(pattern)
      if (invoiceMatch) {
        data.invoiceNumber = invoiceMatch[1]
        break
      }
    }

    // Buscar fecha de expedición
    // Formato: "Fecha de expedición: 2025-11-10" o "2025-11-10"
    const datePatterns = [
      /Fecha\s+de\s+expedición[:\s]+(\d{4})-(\d{1,2})-(\d{1,2})/i,
      /Fecha\s+de\s+expedicion[:\s]+(\d{4})-(\d{1,2})-(\d{1,2})/i,
      /expedición[:\s]+(\d{4})-(\d{1,2})-(\d{1,2})/i,
      /expedicion[:\s]+(\d{4})-(\d{1,2})-(\d{1,2})/i,
      /Fecha[:\s]+(\d{4})-(\d{1,2})-(\d{1,2})/i,
    ]

    for (const pattern of datePatterns) {
      const dateMatch = cleanText.match(pattern)
      if (dateMatch) {
        // dateMatch[1] = año, dateMatch[2] = mes, dateMatch[3] = día
        let day = dateMatch[3]
        let month = dateMatch[2]

        if (day.length === 1) day = '0' + day
        if (month.length === 1) month = '0' + month

        data.date = day
        data.month = month
        data.monthName = getMonthName(month)
        break
      }
    }

    // Buscar nombre del cliente
    // Formato: "Cliente: Cliente Genérico S.A.S."
    const clientPatterns = [
      /Cliente[:\s]+([A-Za-zÁ-úÀ-ÿ0-9\s\.]+?)(?=\s*NIT|$)/i,
      /Razón\s+Social[:\s]+([A-Za-zÁ-úÀ-ÿ0-9\s\.]+?)(?=\s*NIT|$)/i,
      /Razon\s+Social[:\s]+([A-Za-zÁ-úÀ-ÿ0-9\s\.]+?)(?=\s*NIT|$)/i,
      /Nombre[:\s]+([A-Za-zÁ-úÀ-ÿ0-9\s\.]+?)(?=\s*NIT|CC|Dirección|$)/i,
      /Señor(?:es)?[:\s]+([A-Za-zÁ-úÀ-ÿ0-9\s\.]+?)(?=\s*NIT|CC|Dirección|$)/i,
    ]

    for (const pattern of clientPatterns) {
      const clientMatch = cleanText.match(pattern)
      if (clientMatch) {
        // Limpiar el nombre del cliente
        let clientName = clientMatch[1].trim()
        // Remover espacios múltiples
        clientName = clientName.replace(/\s+/g, ' ')
        // Limitar la longitud si es necesario
        if (clientName.length > 0 && clientName.length < 100) {
          data.clientName = clientName
          break
        }
      }
    }

    return data
  }

  // Función para mover archivos HTML
  const processHTMLFiles = async () => {
    try {
      setIsProcessing(true)
      setStatus('Selecciona la carpeta principal...')

      const dirHandle = await window.showDirectoryPicker()
      const htmlFiles = []

      async function scanDirectory(directoryHandle, path = '') {
        for await (const entry of directoryHandle.values()) {
          if (entry.kind === 'directory') {
            await scanDirectory(entry, `${path}${entry.name}/`)
          } else if (entry.kind === 'file' && entry.name.endsWith('.html')) {
            if (path !== '') {
              htmlFiles.push({
                fileHandle: entry,
                originalPath: `${path}${entry.name}`,
                name: entry.name
              })
            }
          }
        }
      }

      setStatus('Escaneando carpetas...')
      await scanDirectory(dirHandle)

      setFilesFound(htmlFiles)
      setStatus(`Se encontraron ${htmlFiles.length} archivos HTML en subcarpetas`)

      if (htmlFiles.length === 0) {
        setStatus('No se encontraron archivos HTML en subcarpetas')
        setIsProcessing(false)
        return
      }

      setStatus('Moviendo archivos a la carpeta principal...')
      let movedCount = 0

      for (const fileInfo of htmlFiles) {
        try {
          const file = await fileInfo.fileHandle.getFile()
          const content = await file.text()

          const newFileHandle = await dirHandle.getFileHandle(fileInfo.name, { create: true })
          const writable = await newFileHandle.createWritable()
          await writable.write(content)
          await writable.close()

          movedCount++
          setStatus(`Movidos ${movedCount}/${htmlFiles.length} archivos...`)
        } catch (error) {
          console.error(`Error moviendo ${fileInfo.name}:`, error)
        }
      }

      setStatus(`✓ Proceso completado! Se movieron ${movedCount} archivos HTML a la carpeta principal`)

    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus('Operación cancelada por el usuario')
      } else {
        setStatus(`Error: ${error.message}`)
        console.error('Error:', error)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Función para escanear y renombrar archivos PDF
  const processPDFFiles = async () => {
    try {
      setIsProcessing(true)
      setStatus('Selecciona la carpeta principal...')

      const dirHandle = await window.showDirectoryPicker()
      const foundPdfFiles = []

      async function scanDirectory(directoryHandle, path = '', parentHandle = null) {
        for await (const entry of directoryHandle.values()) {
          if (entry.kind === 'directory') {
            await scanDirectory(entry, `${path}${entry.name}/`, entry)
          } else if (entry.kind === 'file' && entry.name.endsWith('.pdf')) {
            foundPdfFiles.push({
              fileHandle: entry,
              directoryHandle: directoryHandle,
              originalPath: `${path}${entry.name}`,
              name: entry.name,
              newName: '',
              date: '',
              month: '',
              monthName: '',
              consecutive: '',
              clientName: '',
              invoiceNumber: ''
            })
          }
        }
      }

      setStatus('Escaneando carpetas buscando archivos PDF...')
      await scanDirectory(dirHandle)

      if (foundPdfFiles.length === 0) {
        setStatus('No se encontraron archivos PDF')
        setIsProcessing(false)
        return
      }

      setStatus('Extrayendo datos de los PDFs automáticamente...')

      // Extraer datos de cada PDF
      let consecutivo = 1
      for (let i = 0; i < foundPdfFiles.length; i++) {
        try {
          const file = await foundPdfFiles[i].fileHandle.getFile()
          const text = await extractTextFromPDF(file)
          const extractedData = extractDataFromText(text)

          foundPdfFiles[i].date = extractedData.date
          foundPdfFiles[i].month = extractedData.month
          foundPdfFiles[i].monthName = extractedData.monthName
          foundPdfFiles[i].consecutive = String(consecutivo).padStart(2, '0')
          foundPdfFiles[i].clientName = extractedData.clientName
          foundPdfFiles[i].invoiceNumber = extractedData.invoiceNumber

          // Generar nombre si todos los datos están disponibles
          if (foundPdfFiles[i].date && foundPdfFiles[i].monthName &&
              foundPdfFiles[i].consecutive && foundPdfFiles[i].clientName && foundPdfFiles[i].invoiceNumber) {
            foundPdfFiles[i].newName = `${foundPdfFiles[i].consecutive} ${foundPdfFiles[i].date} ${foundPdfFiles[i].monthName} ${foundPdfFiles[i].clientName} FE${foundPdfFiles[i].invoiceNumber}.pdf`
          }

          consecutivo++
          setStatus(`Procesando PDFs... ${i + 1}/${foundPdfFiles.length}`)
        } catch (error) {
          console.error(`Error procesando ${foundPdfFiles[i].name}:`, error)
        }
      }

      setPdfFiles(foundPdfFiles)
      setStatus(`Se encontraron ${foundPdfFiles.length} archivos PDF. Revisa y ajusta los datos si es necesario.`)
      setIsProcessing(false)

    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus('Operación cancelada por el usuario')
      } else {
        setStatus(`Error: ${error.message}`)
        console.error('Error:', error)
      }
      setIsProcessing(false)
    }
  }

  // Actualizar datos de un PDF específico
  const updatePdfData = (index, field, value) => {
    const updatedPdfs = [...pdfFiles]
    updatedPdfs[index][field] = value

    // Si se actualiza el mes numérico, actualizar también el nombre del mes
    if (field === 'month') {
      updatedPdfs[index].monthName = getMonthName(value)
    }

    // Generar nombre automáticamente
    const pdf = updatedPdfs[index]
    if (pdf.date && pdf.monthName && pdf.consecutive && pdf.clientName && pdf.invoiceNumber) {
      updatedPdfs[index].newName = `${pdf.consecutive} ${pdf.date} ${pdf.monthName} ${pdf.clientName} FE${pdf.invoiceNumber}.pdf`
    }

    setPdfFiles(updatedPdfs)
  }

  // Renombrar todos los PDFs
  const renamePDFs = async () => {
    try {
      setIsProcessing(true)
      let renamedCount = 0

      for (const pdfInfo of pdfFiles) {
        if (!pdfInfo.newName) {
          console.log(`Saltando ${pdfInfo.name} - datos incompletos`)
          continue
        }

        try {
          // Leer el contenido del archivo original
          const file = await pdfInfo.fileHandle.getFile()
          const content = await file.arrayBuffer()

          // Crear el archivo con el nuevo nombre en la misma carpeta
          const newFileHandle = await pdfInfo.directoryHandle.getFileHandle(pdfInfo.newName, { create: true })
          const writable = await newFileHandle.createWritable()
          await writable.write(content)
          await writable.close()

          // Opcional: eliminar el archivo original
          // await pdfInfo.directoryHandle.removeEntry(pdfInfo.name)

          renamedCount++
          setStatus(`Renombrados ${renamedCount}/${pdfFiles.length} archivos...`)
        } catch (error) {
          console.error(`Error renombrando ${pdfInfo.name}:`, error)
        }
      }

      setStatus(`✓ Proceso completado! Se renombraron ${renamedCount} archivos PDF`)
      setPdfFiles([])

    } catch (error) {
      setStatus(`Error: ${error.message}`)
      console.error('Error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="App">
      <div className="container">
        <h1>Organizador de Archivos</h1>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'html' ? 'active' : ''}`}
            onClick={() => setActiveTab('html')}
          >
            Mover HTML
          </button>
          <button
            className={`tab ${activeTab === 'pdf' ? 'active' : ''}`}
            onClick={() => setActiveTab('pdf')}
          >
            Renombrar PDF
          </button>
        </div>

        {/* Contenido de la pestaña HTML */}
        {activeTab === 'html' && (
          <div className="tab-content">
            <p className="description">
              Esta herramienta buscará todos los archivos HTML dentro de subcarpetas
              y los moverá a la carpeta principal que selecciones.
            </p>

            <button
              onClick={processHTMLFiles}
              disabled={isProcessing}
              className="process-button"
            >
              {isProcessing ? 'Procesando...' : 'Seleccionar Carpeta y Mover HTML'}
            </button>

            {filesFound.length > 0 && (
              <div className="files-list">
                <h3>Archivos HTML encontrados:</h3>
                <ul>
                  {filesFound.map((file, index) => (
                    <li key={index}>
                      <span className="file-path">{file.originalPath}</span>
                      <span className="arrow"> → </span>
                      <span className="file-name">{file.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Contenido de la pestaña PDF */}
        {activeTab === 'pdf' && (
          <div className="tab-content">
            <p className="description">
              Esta herramienta extrae automáticamente los datos de tus PDFs y genera nombres con el formato:<br/>
              <strong>Consecutivo DD mes NombreCliente FEXXXX.pdf</strong><br/>
              Ejemplo: 01 10 octubre Cliente Uno FE1222.pdf
            </p>

            {pdfFiles.length === 0 ? (
              <button
                onClick={processPDFFiles}
                disabled={isProcessing}
                className="process-button"
              >
                {isProcessing ? 'Procesando...' : 'Seleccionar Carpeta y Escanear PDFs'}
              </button>
            ) : (
              <>
                <div className="pdf-list">
                  {pdfFiles.map((pdf, index) => (
                    <div key={index} className="pdf-item">
                      <div className="pdf-original-name">
                        <strong>Archivo:</strong> {pdf.name}
                      </div>
                      <div className="pdf-form">
                        <input
                          type="text"
                          placeholder="Consecutivo (01)"
                          value={pdf.consecutive}
                          onChange={(e) => updatePdfData(index, 'consecutive', e.target.value)}
                          maxLength={2}
                        />
                        <input
                          type="text"
                          placeholder="Día (01-31)"
                          value={pdf.date}
                          onChange={(e) => updatePdfData(index, 'date', e.target.value)}
                          maxLength={2}
                        />
                        <input
                          type="text"
                          placeholder="Mes (01-12)"
                          value={pdf.month}
                          onChange={(e) => updatePdfData(index, 'month', e.target.value)}
                          maxLength={2}
                        />
                        <input
                          type="text"
                          placeholder="Mes escrito (octubre)"
                          value={pdf.monthName}
                          onChange={(e) => updatePdfData(index, 'monthName', e.target.value)}
                          readOnly
                          style={{backgroundColor: '#f0f0f0'}}
                          title="Se genera automáticamente del mes numérico"
                        />
                        <input
                          type="text"
                          placeholder="Nombre del Cliente"
                          value={pdf.clientName}
                          onChange={(e) => updatePdfData(index, 'clientName', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="N° Factura (1222)"
                          value={pdf.invoiceNumber}
                          onChange={(e) => updatePdfData(index, 'invoiceNumber', e.target.value)}
                        />
                      </div>
                      {pdf.newName && (
                        <div className="pdf-new-name">
                          <span className="arrow">→</span> <strong>Nuevo nombre:</strong> {pdf.newName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={renamePDFs}
                  disabled={isProcessing || !pdfFiles.some(p => p.newName)}
                  className="process-button"
                >
                  {isProcessing ? 'Renombrando...' : 'Renombrar Todos los PDFs'}
                </button>
                <button
                  onClick={() => setPdfFiles([])}
                  disabled={isProcessing}
                  className="cancel-button"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}

        {status && (
          <div className="status">
            <p>{status}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
