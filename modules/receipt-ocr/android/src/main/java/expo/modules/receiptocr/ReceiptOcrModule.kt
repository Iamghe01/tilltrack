package expo.modules.receiptocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * On-device text recognition for receipts (Google ML Kit, Latin script).
 * Returns every text line with its position, so the JS side can rebuild
 * receipt rows (item name on the left, price on the right).
 */
class ReceiptOcrModule : Module() {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { uriString: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw IllegalStateException("No React context")
        val uri = when {
          uriString.startsWith("content://") || uriString.startsWith("file://") -> Uri.parse(uriString)
          else -> Uri.fromFile(File(uriString))
        }
        val image = InputImage.fromFilePath(context, uri)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            val lines = ArrayList<Map<String, Any>>()
            for (block in result.textBlocks) {
              for (line in block.lines) {
                val box = line.boundingBox ?: continue
                lines.add(
                  mapOf(
                    "text" to line.text,
                    "left" to box.left,
                    "top" to box.top,
                    "right" to box.right,
                    "bottom" to box.bottom,
                    "angle" to line.angle.toDouble()
                  )
                )
              }
            }
            promise.resolve(
              mapOf(
                "width" to image.width,
                "height" to image.height,
                "lines" to lines
              )
            )
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("ERR_OCR", error.message ?: "Text recognition failed", error))
          }
      } catch (error: Exception) {
        promise.reject(CodedException("ERR_OCR", error.message ?: "Text recognition failed", error))
      }
    }
  }
}
