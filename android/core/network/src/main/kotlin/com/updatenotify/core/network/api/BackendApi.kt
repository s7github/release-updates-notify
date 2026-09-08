package com.updatenotify.core.network.api

import com.updatenotify.core.network.BuildConfig
import com.updatenotify.core.network.firestore.AuthDataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Client for the Cloud Run `api` service.
 *
 * This is the *only* HTTP the app performs. It never calls Gemini and never
 * fetches a changelog — both live behind this service (ADR-0003). Two operations
 * exist and both merely enqueue work:
 *
 *  - [discover]  ask the backend to find sources for something not in the catalog
 *  - [requestRefresh]  ask the backend to re-poll an item now
 *
 * Every request carries the caller's Firebase ID token; the backend verifies it
 * and applies its own rate limiting, because both operations spend money.
 */
@Singleton
class BackendApi @Inject constructor(
    private val client: OkHttpClient,
    private val authDataSource: AuthDataSource,
    private val json: Json,
) {

    @Serializable
    data class DiscoverRequest(val query: String)

    @Serializable
    data class DiscoverResponse(
        @SerialName("softwareId") val softwareId: String,
        @SerialName("taskId") val taskId: String? = null,
    )

    @Serializable
    data class RefreshRequest(
        @SerialName("softwareId") val softwareId: String,
        @SerialName("includeHistory") val includeHistory: Boolean = false,
    )

    @Serializable
    data class RefreshResponse(@SerialName("taskId") val taskId: String)

    @Serializable
    private data class ErrorResponse(val error: String? = null, val message: String? = null)

    /**
     * Asks the backend to discover sources for [query] and add it to the catalog.
     *
     * Returns the catalog id. The entry will initially have no releases — the
     * pipeline populates it asynchronously, which is why the response carries a
     * task id to observe (ADR-0003).
     */
    suspend fun discover(query: String): Result<DiscoverResponse> =
        post("v1/discover", json.encodeToString(DiscoverRequest(query)))

    /** Enqueues a poll. Does not perform it — see ADR-0003. */
    suspend fun requestRefresh(
        softwareId: String,
        includeHistory: Boolean = false,
    ): Result<RefreshResponse> =
        post("v1/refresh", json.encodeToString(RefreshRequest(softwareId, includeHistory)))

    private suspend inline fun <reified T> post(path: String, body: String): Result<T> =
        withContext(Dispatchers.IO) {
            runCatching {
                val token = authDataSource.currentIdToken()
                    ?: throw IllegalStateException("Not signed in")

                val request = Request.Builder()
                    .url(BuildConfig.API_BASE_URL.trimEnd('/') + "/" + path)
                    .addHeader("Authorization", "Bearer $token")
                    .post(body.toRequestBody(JSON_MEDIA_TYPE))
                    .build()

                client.newCall(request).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val detail = runCatching {
                            json.decodeFromString<ErrorResponse>(text)
                        }.getOrNull()
                        throw IOException(
                            "api ${response.code}: " +
                                (detail?.error ?: detail?.message ?: response.message),
                        )
                    }
                    json.decodeFromString<T>(text)
                }
            }
        }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
