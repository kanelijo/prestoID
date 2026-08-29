package expo.modules.prestostorage

import android.content.ContentValues
import android.content.Intent
import android.media.MediaScannerConnection
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

    AsyncFunction("createMocksDirectory") { promise: Promise ->
      try {
        val rootMocksDir = File(Environment.getExternalStorageDirectory(), "Mocks")
        if (!rootMocksDir.exists()) {
          rootMocksDir.mkdirs()
        }
        val docsMocksDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "Mocks")
        if (!docsMocksDir.exists()) {
          docsMocksDir.mkdirs()
        }
        promise.resolve(mapOf("success" to true, "path" to rootMocksDir.absolutePath))
      } catch (e: Exception) {
        promise.resolve(mapOf("success" to false, "error" to e.message))
      }
    }

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

        // 1. First priority: Try writing directly to main internal storage root (/storage/emulated/0/Mocks)
        val rootMocksDir = File(Environment.getExternalStorageDirectory(), "Mocks")
        val canWriteToRoot = try {
          if (!rootMocksDir.exists()) {
            rootMocksDir.mkdirs()
          }
          rootMocksDir.exists() && rootMocksDir.canWrite()
        } catch (e: Exception) {
          false
        }

        if (canWriteToRoot) {
          val destFile = File(rootMocksDir, fileName)
          sourceFile.copyTo(destFile, overwrite = true)
          MediaScannerConnection.scanFile(
            context,
            arrayOf(destFile.absolutePath),
            arrayOf(mimeType),
            null
          )
          promise.resolve(mapOf("success" to true, "uri" to destFile.absolutePath, "isRoot" to true))
          return@AsyncFunction
        }

        // 2. Second priority (Scoped Storage on Android 10+): Save into Main Internal Storage > Documents / Mocks
        val relativePath = when (ext) {
            "png", "jpg", "jpeg" -> Environment.DIRECTORY_PICTURES + "/Mocks"
            "mp4" -> Environment.DIRECTORY_MOVIES + "/Mocks"
            else -> Environment.DIRECTORY_DOCUMENTS + "/Mocks"
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
              else -> MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
          }
        } else {
          // Legacy Android (<10)
          val publicDir = when (ext) {
              "png", "jpg", "jpeg" -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
              "mp4" -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
              else -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
          }
          val mocksDir = File(publicDir, "Mocks")
          if (!mocksDir.exists()) mocksDir.mkdirs()
          
          val destFile = File(mocksDir, fileName)
          sourceFile.copyTo(destFile, overwrite = true)
          MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), arrayOf(mimeType), null)
          promise.resolve(mapOf("success" to true, "uri" to destFile.absolutePath, "legacy" to true))
          return@AsyncFunction
        }

        var uri = resolver.insert(collection, contentValues)
        if (uri == null) {
            // Collision or failure, try appending a timestamp
            val nameWithoutExt = fileName.substringBeforeLast('.')
            val newFileName = "${nameWithoutExt}_${System.currentTimeMillis()}.$ext"
            contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, newFileName)
            uri = resolver.insert(collection, contentValues)
                ?: throw Exception("Failed to create MediaStore entry in Mocks")
        }

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
