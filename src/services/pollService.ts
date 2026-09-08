import { doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { extractReleaseNotes, searchLatestReleaseFallback } from "./gemini";
import { autoCorrectSoftware, logLearning } from "./learningService";
import { createTask, updateTask } from "./taskService";

const getEffectivePriority = (software: any): string[] => {
  if (software.suggested_priority && Array.isArray(software.suggested_priority)) {
    return software.suggested_priority;
  }
  if (software.priority_order) {
    return software.priority_order.split(',').map((s: string) => s.trim().toLowerCase());
  }
  return ['github', 'rss', 'html'];
};

export const pollSoftware = async (software: any, taskId?: string) => {
  let taskDetails: any = {
    activePriority: getEffectivePriority(software),
    currentAction: 'initializing'
  };

  const logProgress = async (progress: number, message: string, newDetails?: any) => {
    if (taskId) {
      if (newDetails) {
        taskDetails = { ...taskDetails, ...newDetails };
      }
      await updateTask(taskId, { 
        progress, 
        message, 
        status: 'processing',
        details: { ...taskDetails }
      });
    }
  };

  try {
    await logProgress(10, "Determining best sources...");
    // 1. Determine best source
    const priority = taskDetails.activePriority;
    const aggregatedData: string[] = [];

    await logProgress(30, "Initiating multi-source discovery...");
    
    for (const p of priority) {
      if (p === 'github' && software.github_url) {
        try {
          await logProgress(35, "Accessing GitHub API...", { sourceUrl: software.github_url, currentAction: 'fetching_github' });
          const cleanUrl = software.github_url.replace(/\/+$/, '').replace(/\.git$/, '');
          const parts = cleanUrl.split('github.com/');
          if (parts.length >= 2) {
            const repoPath = parts[1].replace(/\/$/, '');
            if (repoPath.includes('/') && repoPath.split('/').length >= 2) {
              const apiUrl = `https://api.github.com/repos/${repoPath}/releases`;
              const res = await fetch(`/api/proxy?url=${encodeURIComponent(apiUrl)}`);
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                  aggregatedData.push(`[GitHub Releases]\n${JSON.stringify(data.slice(0, 3))}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn("GitHub poll failed", e);
        }
      } else if (p === 'rss' && software.rss_url) {
        try {
          await logProgress(40, "Checking RSS history feeds...", { sourceUrl: software.rss_url, currentAction: 'fetching_rss' });
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(software.rss_url)}&type=rss`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.items && data.items.length > 0) {
              aggregatedData.push(`[RSS Feed]\n${JSON.stringify(data.items.slice(0, 3))}`);
            }
          }
        } catch (e) {
          console.warn("RSS poll failed", e);
        }
      } else if (p === 'changelog' || p === 'html') {
        const fallbackUrl = software.changelog_url || software.website;
        if (fallbackUrl) {
          try {
            await logProgress(45, "Checking custom scraper scripts...", { sourceUrl: fallbackUrl, currentAction: 'fetching_scripts' });
            const scriptRes = await fetch(`/api/proxy?url=${encodeURIComponent(fallbackUrl)}&type=custom_script`);
            if (scriptRes.ok) {
               const scriptData = await scriptRes.json();
               if (scriptData.scriptData && scriptData.scriptData.length > 0) {
                  await logProgress(60, `Script parser found latest release natively...`, { currentAction: 'parsing_script' });
                  aggregatedData.push(`[Script Scraper Latest]\n${JSON.stringify(scriptData.scriptData[0])}`);
               }
            }
          } catch (e) {}

          try {
            await logProgress(50, "Scraping official website context...", { sourceUrl: fallbackUrl, currentAction: 'fetching_html' });
            const res = await fetch(`/api/proxy?url=${encodeURIComponent(fallbackUrl)}&type=html`);
            if (res.ok) {
              const data = await res.json();
              const html = data.html || "";
              aggregatedData.push(`[Website/Changelog HTML]\n${html.substring(0, 50000)}`);
            }
          } catch (e) {
            console.warn("HTML fallback poll failed", e);
          }
        }
      }
    }

    if (aggregatedData.length === 0) {
      await logProgress(40, "No data sources resolved, falling back to AI web search...", { currentAction: 'initiating_search' });
    }

    const finalRawData = aggregatedData.join("\n\n---\n\n");

    // 2. AI Extraction
    await logProgress(60, "Processing updates with Gemini AI...", { currentAction: 'ai_extraction' });
    let extracted: any = null;
    
    if (aggregatedData.length > 0) {
      try {
        extracted = await extractReleaseNotes(software.name, finalRawData);
      } catch (e) {
        console.warn("Direct extraction failed, attempting semantic search block...", e);
      }
    }
    
    if (!extracted || !extracted.version || extracted.isGenuineUpdate === false) {
      await logProgress(70, "Data inconclusive, using AI Web Search capability...");
      try {
        const fallBackData = await searchLatestReleaseFallback(software.name);
        if (fallBackData && fallBackData.version) {
          extracted = fallBackData;
        } else {
          throw new Error("Search fallback yielded no update");
        }
      } catch (e) {
         throw new Error(`Data found for ${software.name} but no genuine version update or announcement was detected.`);
      }
    }

    // 3. Self-Learning Check
    if (extracted.metadataLearnings) {
      await logProgress(80, "Refining metadata via Self-Learning...");
      await autoCorrectSoftware(software.id, software, extracted.metadataLearnings);
    }

    // 4. Check for duplicates / Save note
    const noteId = `${software.id}-${extracted.version.replace(/[^a-z0-9]/g, '-')}`;
    const noteRef = doc(db, "release_notes", noteId);
    
    await setDoc(noteRef, {
      ...extracted,
      softwareId: software.id,
      softwareName: software.name,
      releaseDate: extracted.releaseDate || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      rawData: finalRawData.substring(0, 5000)
    });

    // 4. Update last check in registry
    await updateDoc(doc(db, "master_registry", software.id), {
      lastVersion: extracted.version,
      lastReleaseDate: extracted.releaseDate || new Date().toISOString(),
      lastCheck: new Date().toISOString()
    });

    if (taskId) await updateTask(taskId, { progress: 100, message: "Release discovered successfully!", status: 'completed' });
    return extracted;
  } catch (e: any) {
    if (taskId) await updateTask(taskId, { status: 'failed', error: e.message || String(e), message: "Process failed" });
    throw e;
  }
};

export const pollSoftwareHistory = async (software: any, taskId?: string) => {
  let taskDetails: any = {
    sourceUrl: software.changelog_url || software.website || software.github_url,
    currentAction: 'initializing',
    activePriority: getEffectivePriority(software),
    settings: {
      maxCount: software.historyMaxCount,
      minDate: software.historyMinDate
    }
  };

  const logProgress = async (progress: number, message: string, newDetails?: any) => {
    if (taskId) {
      if (newDetails) {
        taskDetails = { ...taskDetails, ...newDetails };
      }
      await updateTask(taskId, { 
        progress, 
        message, 
        status: 'processing',
        details: { ...taskDetails }
      });
    }
  };

  try {
    await logProgress(10, "Gathering historical data points...");
    const aggregatedData: string[] = [];
    
    // 1. Determine priority and start gathering
    const priority = taskDetails.activePriority;

    await logProgress(20, "Initiating multi-source discovery...", { currentAction: 'fetching_sources' });

    for (const p of priority) {
      if (p === 'github' && software.github_url) {
        try {
          await logProgress(25, "Accessing GitHub API...", { sourceUrl: software.github_url, currentAction: 'fetching_github' });
          const cleanUrl = software.github_url.replace(/\/+$/, '').replace(/\.git$/, '');
          const parts = cleanUrl.split('github.com/');
          if (parts.length >= 2) {
            const repoPath = parts[1].replace(/\/$/, '');
            const apiReleasesUrl = `https://api.github.com/repos/${repoPath}/releases?per_page=50`;
            const resReleases = await fetch(`/api/proxy?url=${encodeURIComponent(apiReleasesUrl)}`);
            if (resReleases.ok) {
              const data = await resReleases.json();
              if (Array.isArray(data) && data.length > 0) {
                aggregatedData.push(`[GitHub Releases History]\n${JSON.stringify(data)}`);
              }
            }
          }
        } catch (e) {
          console.warn("GitHub history poll failed", e);
        }
      } else if (p === 'rss' && software.rss_url) {
        try {
          await logProgress(30, "Checking RSS history feeds...", { sourceUrl: software.rss_url, currentAction: 'fetching_rss' });
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(software.rss_url)}&type=rss`);
          if (res.ok) {
            const data = await res.json();
            aggregatedData.push(`[RSS History]\n${JSON.stringify(data.items)}`);
          }
        } catch (e) {
          console.warn("RSS history poll failed", e);
        }
      } else if (p === 'changelog' || p === 'html') {
        const historyUrl = software.changelog_url || software.website;
        if (historyUrl) {
          try {
            await logProgress(35, "Checking custom scraper scripts...", { sourceUrl: historyUrl, currentAction: 'fetching_scripts' });
            const scriptRes = await fetch(`/api/proxy?url=${encodeURIComponent(historyUrl)}&type=custom_script`);
            if (scriptRes.ok) {
               const scriptData = await scriptRes.json();
               if (scriptData.scriptData && scriptData.scriptData.length > 0) {
                  let history = scriptData.scriptData;
                  
                  // Apply Admin Filters
                  if (software.historyMinDate) {
                    const minDate = new Date(software.historyMinDate);
                    history = history.filter((item: any) => new Date(item.releaseDate) >= minDate);
                  }
                  if (software.historyMaxCount && software.historyMaxCount > 0) {
                    history = history.slice(0, software.historyMaxCount);
                  }

                  await logProgress(50, `Found ${history.length} records via script. Verifying...`, { 
                    foundCount: history.length, 
                    samples: history.slice(0, 3),
                    currentAction: 'saving_records',
                    sourceUrl: historyUrl
                  });

                  const chunkSize = 50;
                  for (let i = 0; i < history.length; i += chunkSize) {
                     const chunk = history.slice(i, i + chunkSize);
                     const { writeBatch } = await import('firebase/firestore');
                     const batch = writeBatch(db);
                     for (const item of chunk) {
                       const noteId = `${software.id}-${item.version.replace(/[^a-z0-9]/g, '-')}`;
                       const noteRef = doc(db, "release_notes", noteId);
                       batch.set(noteRef, {
                         ...item,
                         softwareId: software.id,
                         softwareName: software.name,
                         createdAt: new Date().toISOString(),
                         isGenuineUpdate: true
                       }, { merge: true });
                     }
                     await batch.commit();
                     await logProgress(50 + Math.floor((i / history.length) * 40), `Processed ${i + chunk.length} records...`, {
                        completedCount: i + chunk.length,
                        foundCount: history.length,
                        currentAction: 'committing_batch'
                     });
                  }

                  if (taskId) await updateTask(taskId, { progress: 100, message: `Successfully matched and saved ${history.length} historical releases!`, status: 'completed' });
                  return history;
               }
            }
          } catch (e) {
            console.warn("Custom Script scraping failed", e);
          }

          // FALLBACK to HTML scraping if script didn't return data
          try {
            await logProgress(40, "Scraping official website context for history...", { sourceUrl: historyUrl, currentAction: 'fetching_html' });
            const res = await fetch(`/api/proxy?url=${encodeURIComponent(historyUrl)}&type=html`);
            if (res.ok) {
              const data = await res.json();
              const html = data.html || "";
              if (html.length > 500) {
                aggregatedData.push(`[Website/Changelog HTML History]\n${html.substring(0, 80000)}`);
              }
            }
          } catch (e) {
            console.warn("HTML history poll fallback failed", e);
          }
        }
      }
    }

    if (aggregatedData.length === 0) {
      throw new Error(`No historical data found across prioritized sources (${priority.join(', ')}). Please verify URLs or adjust priority.`);
    }

    // 2. AI Extraction for Multiple Items
    await logProgress(70, "Bulk extracting history via Gemini AI...", { currentAction: 'ai_extraction' });
    let history = [];
    
    if (aggregatedData.length > 0) {
      try {
        history = await import("./gemini").then(m => m.extractHistory(software.name, aggregatedData.join("\n\n---\n\n")));
      } catch (e) {
        console.warn("Direct history extraction failed", e);
      }
    }
    
    if (!Array.isArray(history) || history.length === 0) {
       await logProgress(75, "Data inconclusive, using AI Web Search for history archive...", { currentAction: 'initiating_search' });
       try {
         history = await import("./gemini").then(m => m.searchHistoryFallback(software.name));
       } catch (e) {
         throw new Error(`Historical data for ${software.name} could not be resolved from known sources or search.`);
       }
    }
    
    if (!Array.isArray(history) || history.length === 0) {
       throw new Error("No release history found for this software.");
    }

    // Apply Admin Filters to AI extracted history too
    let filteredHistory = history;
    if (software.historyMinDate) {
      const minDate = new Date(software.historyMinDate);
      filteredHistory = filteredHistory.filter((item: any) => new Date(item.releaseDate) >= minDate);
    }
    if (software.historyMaxCount && software.historyMaxCount > 0) {
      filteredHistory = filteredHistory.slice(0, software.historyMaxCount);
    }

    await logProgress(80, `AI extracted ${filteredHistory.length} history items. Saving...`, { 
      foundCount: filteredHistory.length, 
      samples: filteredHistory.slice(0, 3),
      currentAction: 'saving_ai_extracted' 
    });

    for (let i = 0; i < filteredHistory.length; i++) {
      const item = filteredHistory[i];
      const noteId = `${software.id}-${item.version.replace(/[^a-z0-9]/g, '-')}`;
      const noteRef = doc(db, "release_notes", noteId);
      
      await setDoc(noteRef, {
        ...item,
        softwareId: software.id,
        softwareName: software.name,
        createdAt: new Date().toISOString(),
        isGenuineUpdate: true
      }, { merge: true });

      if (i % 10 === 0) {
        await logProgress(80 + Math.floor((i / filteredHistory.length) * 20), `Saving record ${i+1}/${filteredHistory.length}...`, {
          completedCount: i + 1,
          foundCount: filteredHistory.length
        });
      }
    }

    if (taskId) await updateTask(taskId, { progress: 100, message: `Discovered and saved ${filteredHistory.length} historical releases!`, status: 'completed' });
    return filteredHistory;
  } catch (e: any) {
    if (taskId) await updateTask(taskId, { status: 'failed', error: e.message || String(e), message: "History scrape failed" });
    throw e;
  }
};


