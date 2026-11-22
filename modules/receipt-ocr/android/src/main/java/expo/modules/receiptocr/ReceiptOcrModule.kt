package expo.modules.receiptocr

import android.app.Activity
import android.net.Uri
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
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
  private var pendingScan: Promise? = null
  private val scanRequestCode = 47021

  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    // Opens Google's document scanner. Resolves with the JPEG page URIs, or an empty list if cancelled.
    AsyncFunction("scanDocument") { pageLimit: Int, allowGallery: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(CodedException("ERR_NO_ACTIVITY", "No screen to show the scanner on", null))
        return@AsyncFunction
      }
      if (pendingScan != null) {
        promise.reject(CodedException("ERR_BUSY", "The scanner is already open", null))
        return@AsyncFunction
      }
      val options = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(allowGallery)
        .setPageLimit(pageLimit.coerceIn(1, 5))
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build()
      pendingScan = promise
      GmsDocumentScanning.getClient(options)
        .getStartScanIntent(activity)
        .addOnSuccessListener { intentSender ->
          try {
            activity.startIntentSenderForResult(intentSender, scanRequestCode, null, 0, 0, 0)
          } catch (e: Exception) {
            pendingScan = null
            promise.reject(CodedException("ERR_SCANNER", e.message ?: "Couldn't open the scanner", e))
          }
        }
        .addOnFailureListener { e ->
          pendingScan = null
          promise.reject(CodedException("ERR_SCANNER_UNAVAILABLE", e.message ?: "The document scanner isn't available", e))
        }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != scanRequestCode) return@OnActivityResult
      val promise = pendingScan ?: return@OnActivityResult
      pendingScan = null
      if (payload.resultCode != Activity.RESULT_OK) {
        promise.resolve(emptyList<String>())
        return@OnActivityResult
      }
      val result = GmsDocumentScanningResult.fromActivityResultIntent(payload.data)
      val uris = result?.pages?.map { it.imageUri.toString() } ?: emptyList()
      promise.resolve(uris)
    }

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
