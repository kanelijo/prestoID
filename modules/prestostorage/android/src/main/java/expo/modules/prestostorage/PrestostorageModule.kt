package expo.modules.prestostorage

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream

class PrestostorageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Prestostorage")

    AsyncFunction("saveDocument") { localUriString: String, fileName: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exception("React context not available")
      
      try {
        val sourcePath = Uri.parse(localUriString).path ?: localUriString.replace("file://", "")
        val sourceFile = File(sourcePath)
        if (!sourceFile.exists()) {
          throw Exception("Source file does not exist at ${sourceFile.absolutePath}")
        }

        val resolver = context.contentResolver
        
        // Determine MIME type
        val ext = fileName.substringAfterLast('.', "").lowercase()
        val mimeType = when (ext) {
            "pdf" -> "application/pdf"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "mp4" -> "video/mp4"
            else -> "application/octet-stream"
        }

        // Determine destination path based on file type
        val relativePath = when (ext) {
            "png", "jpg", "jpeg" -> Environment.DIRECTORY_PICTURES + "/PrestoID/PrestoID Images"
            "mp4" -> Environment.DIRECTORY_MOVIES + "/PrestoID/PrestoID Videos"
            else -> Environment.DIRECTORY_DOWNLOADS + "/PrestoID/PrestoID Documents"
        }

        val contentValues = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
          }
        }

        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          when (ext) {
              "png", "jpg", "jpeg" -> MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
              "mp4" -> MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
              else -> MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
          }
        } else {
          // For Android < 10, just write directly to the public directories
          val publicDir = when (ext) {
              "png", "jpg", "jpeg" -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
              "mp4" -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
              else -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          }
          val prestoDir = File(publicDir, "PrestoID")
          if (!prestoDir.exists()) prestoDir.mkdirs()
          
          val destFile = File(prestoDir, fileName)
          sourceFile.copyTo(destFile, overwrite = true)
          
          // Legacy Intent using FileProvider is complex without XML config. 
          // Since target is modern Android, we'll return the file URI for older devices and let JS handle it.
          promise.resolve(mapOf("success" to true, "uri" to destFile.absolutePath, "legacy" to true))
          return@AsyncFunction
        }

        val uri = resolver.insert(collection, contentValues) ?: throw Exception("Failed to create MediaStore entry")

        try {
          resolver.openOutputStream(uri)?.use { outputStream ->
            FileInputStream(sourceFile).use { inputStream ->
              inputStream.copyTo(outputStream)
            }
          }
          
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            contentValues.clear()
            contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)
          }

          promise.resolve(mapOf("success" to true, "uri" to uri.toString(), "legacy" to false))
        } catch (e: Exception) {
          resolver.delete(uri, null, null)
          throw e
        }
      } catch (err: Exception) {
        promise.reject("PRESTO_STORAGE_ERROR", err.message, err)
      }
    }
  }
}
