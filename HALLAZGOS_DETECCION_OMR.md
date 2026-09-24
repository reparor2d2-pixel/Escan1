# Hallazgo: posible fragilidad en la elección de orientación del escáner

Al trabajar en mejoras de velocidad/precisión del escaneo (`app.js`, funciones
`detectSheetOnCanvas` → `findBestMarkerPattern`), se construyó un test de
extremo a extremo que no requiere cámara física: genera la propia hoja
imprimible de la app (`createLetterSheetCanvas`), la "marca" digitalmente con
una clave de respuestas conocida en las posiciones exactas de las burbujas, y
la vuelve a pasar por el lector real (`window.EvaluaCamOMR.rectifyByMarkers` +
`readAnswersFromRectified`), comparando lo leído contra la clave conocida.

## Qué se observó

En 2 de 3 escenarios probados (distintas cantidades de preguntas/alternativas/
copias por hoja), el lector detectó bien los 6 marcadores geométricamente,
pero **eligió una orientación incorrecta** (la hoja interpretada rotada o
invertida), devolviendo una hoja de respuestas casi completamente errónea —
no por mala lectura de burbujas individuales, sino por tomar mal qué esquina
es cuál.

## Causa probable

En `findBestMarkerPattern` (`app.js`, línea ~503), la fórmula que decide cuál
combinación de marcadores/orientación es la correcta pondera fuertemente
`orientation.raw` (una medida gruesa: "¿esta franja ancha de la hoja es más
oscura que la franja opuesta?"). Esa medida puede ser engañada por
coincidencia cuando esa franja ancha cae sobre contenido oscuro no
relacionado (burbujas marcadas, texto, líneas de columna), permitiendo que un
candidato geométricamente peor —pero que por azar "parece" más oscuro donde
se espera la franja de sincronización— gane sobre el candidato correcto.

Existe una medida más específica y en teoría más robusta ya calculada en el
mismo lugar (`orientation.signature`, de `timingSignatureEvidence`): compara
cada una de las 10 barras de sincronización contra el ancho exacto esperado
según el hash de la evaluación, en vez de solo "cuán oscura" es una zona
amplia. Se intentó rebalancear la fórmula para priorizar `signature` sobre
`raw`.

## Por qué no se aplicó un fix

Al revisar los números en detalle, **incluso la orientación geométricamente
correcta obtuvo un puntaje de `signature` sorprendentemente bajo** (~0.05,
lejos del umbral ~0.36-0.48 que el propio código usa en otras partes como
señal de "verificado") en la imagen sintética generada digitalmente. Esto deja
dos posibilidades sin resolver:

1. El peso de la fórmula está mal calibrado (`raw` domina cuando no debería) —
   en cuyo caso el rebalanceo propuesto sería correcto, o
2. El patrón de sincronización es marginal/débil a la resolución con la que se
   analiza el primer frame (downscale a 1000×1350px), y una foto real —con su
   propio contraste, nitidez y condiciones de impresión— podría comportarse
   mejor o peor que este render digital perfecto, haciendo que un ajuste
   basado solo en esta prueba sintética sea riesgoso.

Sin fotos reales tomadas con teléfono para contrastar, no fue posible
distinguir entre ambas hipótesis con confianza suficiente para tocar código
de detección que hoy funciona en producción. Se optó por **no aplicar ningún
cambio** a `findBestMarkerPattern` y documentar el hallazgo aquí.

## Cómo validar / continuar esto en el futuro

- Tomar 10-20 fotos reales (distintos teléfonos, luz, ángulos) de hojas con
  respuestas ya conocidas, y usarlas como set de regresión.
- Si se dispone de ese set, comparar la tasa de acierto de orientación con la
  fórmula actual (`score = confidence + orientation.raw*.7`) contra una
  variante que priorice `signature` (`score = confidence +
  orientation.signature*.7 + orientation.signatureMin*.25`), antes de decidir
  cuál usar.
- El script de prueba sintética (genera hoja → marca respuestas → lee) es
  reutilizable como smoke test rápido sin cámara; puede recrearse fácilmente
  llamando a `createLetterSheetCanvas`, `responseBubbleMetrics` y
  `window.EvaluaCamOMR` directamente desde una página cargada con Playwright
  u otra herramienta headless.

## Cambio que sí se aplicó en esta rama

Se agregó `captureHighResFrame()` (usa `ImageCapture.takePhoto()` cuando el
navegador/dispositivo lo soporta, para obtener un frame de mayor calidad que
el stream de vídeo en vivo al momento de la captura final) con retroceso
automático al método anterior (`drawVideoFrame` sobre el `<video>`) si no está
disponible. No modifica la lógica de detección ni de lectura de burbujas, por
lo que no debería introducir el riesgo descrito arriba.
