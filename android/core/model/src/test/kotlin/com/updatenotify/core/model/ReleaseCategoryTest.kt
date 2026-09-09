package com.updatenotify.core.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReleaseCategoryTest {

    @Test
    fun `wire values round-trip`() {
        ReleaseCategory.entries.forEach { category ->
            assertThat(ReleaseCategory.fromWireValue(category.wireValue)).isEqualTo(category)
        }
    }

    @Test
    fun `wire values match the extraction prompt exactly`() {
        // These strings are what the Gemini prompt constrains output to. A typo
        // here silently turns every release of that kind into UNKNOWN.
        assertThat(ReleaseCategory.NEW_FEATURES.wireValue).isEqualTo("New Features")
        assertThat(ReleaseCategory.FEATURE_UPDATES.wireValue).isEqualTo("Feature Updates")
        assertThat(ReleaseCategory.OPTIMIZATION.wireValue).isEqualTo("Optimization/Tips")
        assertThat(ReleaseCategory.BUG_FIXES.wireValue).isEqualTo("Bug Fixes")
        assertThat(ReleaseCategory.SECURITY_PATCHES.wireValue).isEqualTo("Security Patches")
        assertThat(ReleaseCategory.MAJOR_MILESTONE.wireValue)
            .isEqualTo("Major Milestone Update")
    }

    @Test
    fun `unrecognised input becomes UNKNOWN instead of throwing`() {
        assertThat(ReleaseCategory.fromWireValue("Something Gemini Invented"))
            .isEqualTo(ReleaseCategory.UNKNOWN)
        assertThat(ReleaseCategory.fromWireValue(null)).isEqualTo(ReleaseCategory.UNKNOWN)
        assertThat(ReleaseCategory.fromWireValue("")).isEqualTo(ReleaseCategory.UNKNOWN)
    }

    @Test
    fun `high priority covers security and milestones only`() {
        assertThat(ReleaseCategory.SECURITY_PATCHES.isHighPriority).isTrue()
        assertThat(ReleaseCategory.MAJOR_MILESTONE.isHighPriority).isTrue()
        assertThat(ReleaseCategory.BUG_FIXES.isHighPriority).isFalse()
        assertThat(ReleaseCategory.NEW_FEATURES.isHighPriority).isFalse()
    }
}
