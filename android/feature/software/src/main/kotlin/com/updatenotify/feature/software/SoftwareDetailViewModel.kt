package com.updatenotify.feature.software

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.updatenotify.core.domain.repository.InterestRepository
import com.updatenotify.core.domain.repository.ReleaseRepository
import com.updatenotify.core.domain.repository.SoftwareRepository
import com.updatenotify.core.domain.repository.TaskRepository
import com.updatenotify.core.domain.usecase.GetReleaseTimelineUseCase
import com.updatenotify.core.domain.usecase.ToggleFollowUseCase
import com.updatenotify.core.model.BackgroundTask
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.Software
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SoftwareDetailUiState(
    val software: Software? = null,
    val interest: Interest? = null,
    val releases: List<Release> = emptyList(),
    val activeTask: BackgroundTask? = null,
    val message: String? = null,
) {
    val isFollowing: Boolean get() = interest != null

    /**
     * True when the catalog entry exists but the pipeline has not produced a
     * release yet. A real onboarding state, not an error (ADR-0003).
     */
    val isAwaitingFirstPoll: Boolean
        get() = releases.isEmpty() && software?.isAwaitingFirstPoll == true
}

@HiltViewModel
class SoftwareDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    softwareRepository: SoftwareRepository,
    getTimeline: GetReleaseTimelineUseCase,
    private val interestRepository: InterestRepository,
    private val releaseRepository: ReleaseRepository,
    private val taskRepository: TaskRepository,
    private val toggleFollow: ToggleFollowUseCase,
) : ViewModel() {

    private val softwareId: String = checkNotNull(savedStateHandle[ARG_SOFTWARE_ID]) {
        "SoftwareDetail requires a $ARG_SOFTWARE_ID argument"
    }

    private val activeTaskId = MutableStateFlow<String?>(null)
    private val message = MutableStateFlow<String?>(null)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val activeTask = activeTaskId.flatMapLatest { id ->
        if (id == null) flowOf(null) else taskRepository.observeTask(id)
    }

    val uiState: StateFlow<SoftwareDetailUiState> = combine(
        softwareRepository.observeSoftware(softwareId),
        interestRepository.observeInterest(softwareId),
        getTimeline(softwareId),
        activeTask,
        message,
    ) { software, interest, releases, task, msg ->
        SoftwareDetailUiState(
            software = software,
            interest = interest,
            releases = releases,
            // Drop a finished task so the progress bar disappears on completion.
            activeTask = task?.takeUnless { it.isTerminal },
            message = msg,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SoftwareDetailUiState(),
    )

    fun toggleFollow() {
        viewModelScope.launch {
            val software = uiState.value.software ?: return@launch
            toggleFollow(software, uiState.value.interest).onFailure {
                message.value = it.message ?: "Could not update"
            }
        }
    }

    /**
     * Asks the backend to poll now. The app does not poll (ADR-0003) — this
     * enqueues a job and then follows its progress document.
     */
    fun requestRefresh() {
        if (activeTaskId.value != null) return
        viewModelScope.launch {
            releaseRepository.requestRefresh(softwareId).fold(
                onSuccess = { taskId ->
                    activeTaskId.value = taskId
                    // Clear once the job finishes so a later refresh can start.
                    taskRepository.observeTask(taskId).first { it?.isTerminal == true }
                    activeTaskId.value = null
                },
                onFailure = { message.value = it.message ?: "Could not request an update" },
            )
        }
    }

    fun dismissMessage() {
        message.value = null
    }

    companion object {
        const val ARG_SOFTWARE_ID = "softwareId"
    }
}
