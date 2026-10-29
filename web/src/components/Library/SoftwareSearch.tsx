import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { Plus, Search as SearchIcon } from "lucide-react";
import { loadCatalogIndex } from "../../services/catalogIndex";
import { suggest, type IndexEntry, type Suggestion } from "../../services/suggest";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onFollow: (entry: IndexEntry) => void;
  /** Free text with no highlighted suggestion: runs the Firestore prefix search. */
  onSubmitText: (text: string) => void;
  searching?: boolean;
}

/** Autocomplete over the local catalog index; typos are listed under "Did you mean…?". */
export default function SoftwareSearch({ value, onChange, onFollow, onSubmitText, searching }: Props) {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    let live = true;
    void loadCatalogIndex().then((entries) => live && setIndex(entries));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 80);
    return () => clearTimeout(t);
  }, [value]);

  const options = useMemo<Suggestion[]>(() => suggest(index, debounced, 8), [index, debounced]);

  return (
    <Paper sx={{ p: 1, display: "flex", borderRadius: 4, border: "2px solid rgba(242, 125, 38, 0.2)", mb: 4 }}>
      <Autocomplete<Suggestion, false, false, true>
        freeSolo
        fullWidth
        autoHighlight={false}
        options={options}
        filterOptions={(x) => x}
        groupBy={(o) => (o.kind === "fuzzy" ? "Did you mean…?" : "")}
        getOptionLabel={(o) => (typeof o === "string" ? o : o.entry.name)}
        isOptionEqualToValue={(a, b) => typeof b !== "string" && a.entry.id === b.entry.id}
        inputValue={value}
        onInputChange={(_, next, reason) => { if (reason !== "reset") onChange(next); }}
        onChange={(_, picked) => {
          if (picked && typeof picked !== "string") onFollow(picked.entry);
          else if (typeof picked === "string" && picked.trim()) onSubmitText(picked);
        }}
        renderOption={(props, option) => {
          const { key, ...rest } = props as typeof props & { key: string };
          return (
            <Box component="li" key={key} {...rest} sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{option.entry.name}</Typography>
                {option.entry.vendor && (
                  <Typography variant="caption" color="text.secondary">{option.entry.vendor}</Typography>
                )}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "primary.main" }} aria-hidden>
                <Plus size={14} /> <Typography variant="caption" sx={{ fontWeight: 700 }}>Follow</Typography>
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            label="Search for software"
            placeholder="e.g. VS Code, Figma, FL Studio"
            autoFocus
            sx={{ ml: 2, my: 0.5 }}
            slotProps={{ ...params.slotProps, input: { ...params.slotProps.input, disableUnderline: true } }}
          />
        )}
      />
      <Button
        variant="contained"
        onClick={() => onSubmitText(value)}
        disabled={searching || !value.trim()}
        startIcon={searching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon size={18} />}
        sx={{ borderRadius: 3, px: 4, alignSelf: "center" }}
      >
        Search
      </Button>
    </Paper>
  );
}
