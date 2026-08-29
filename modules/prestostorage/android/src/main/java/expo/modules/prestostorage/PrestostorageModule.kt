package expo.modules.prestostorage

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream

class PrestostorageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Prestostorage")

    AsyncFunction("hasStoragePermission") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false)
        return@AsyncFunction
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        promise.resolve(Environment.isExternalStorageManager())
      } else {
        val granted = ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED
        promise.resolve(granted)
      }
    }

    AsyncFunction("requestStoragePermission") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("PRESTO_NO_CONTEXT", "React context not available", null)
        return@AsyncFunction
      }

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          if (!Environment.isExternalStorageManager()) {
            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
              data = Uri.parse("package:" + context.packageName)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            promise.resolve(mapOf("requested" to true, "type" to "manage_all_files"))
          } else {
            promise.resolve(mapOf("requested" to false, "alreadyGranted" to true))
          }
        } else {
          promise.resolve(mapOf("requested" to true, "type" to "legacy"))
        }
      } catch (e: Exception) {
        try {
          // Fallback intent if package uri fails
          val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
          promise.resolve(mapOf("requested" to true, "type" to "generic_manage"))
        } catch (err: Exception) {
          promise.reject("PRESTO_PERMISSION_ERROR", err.message, err)
        }
      }
    }

    AsyncFunction("createMocksDirectory") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(mapOf("success" to false, "error" to "No context"))
        return@AsyncFunction
      }

      try {
        // 1. Root of Internal Storage (/storage/emulated/0/Mocks)
        val rootMocksDir = File(Environment.getExternalStorageDirectory(), "Mocks")
        var created = false
        if (!rootMocksDir.exists()) {
          created = rootMocksDir.mkdirs()
        } else {
          created = true
        }

        // Write an info file and trigger MediaScanner so it instantly shows in File Managers
        val infoFile = File(rootMocksDir, "Mocks_Storage.txt")
        if (!infoFile.exists() && rootMocksDir.canWrite()) {
          infoFile.writeText("Mocks Directory: Official storage for test papers, question sheets, and institute documents.")
          MediaScannerConnection.scanFile(
            context,
            arrayOf(infoFile.absolutePath),
            arrayOf("text/plain"),
            null
          )
        }

        // 2. Also ensure Documents/Mocks exists as standard Scoped Storage backup
        val docsMocksDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "Mocks")
        if (!docsMocksDir.exists()) {
          docsMocksDir.mkdirs()
        }

        promise.resolve(mapOf(
          "success" to true,
          "path" to rootMocksDir.absolutePath,
          "canWrite" to rootMocksDir.canWrite(),
          "created" to created
        ))
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

        // 1. Direct write to /storage/emulated/0/Mocks if accessible
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

        // 2. MediaStore Documents/Mocks (Main Storage)
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
