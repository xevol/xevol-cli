import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { DEFAULT_API_URL, readConfig, writeConfig, type XevolConfig } from "../../lib/config";
import type { Hint } from "../components/Footer";

interface SettingsProps {
  onBack: () => void;
  setFooterHints: (hints: Hint[]) => void;
}

type SettingKey = "apiUrl" | "default.lang" | "default.limit" | "workspaceId";

const LANGUAGES = ["en", "de", "es", "fr", "it", "ja", "kk", "ko", "ru"] as const;

type LanguageCode = (typeof LANGUAGES)[number];

export function Settings({ onBack, setFooterHints }: SettingsProps): JSX.Element {
  const [config, setConfig] = useState<XevolConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingKey, setEditingKey] = useState<SettingKey | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = (await readConfig()) ?? {};
        if (mounted) {
          setConfig(loaded);
        }
      } catch (err) {
        if (mounted) {
          setError((err as Error).message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setFooterHints([
      { key: "↑/↓", description: "move" },
      { key: "Enter", description: "edit/confirm" },
      { key: "Tab", description: "confirm" },
      { key: "Esc", description: "back/cancel" },
      { key: "q", description: "quit" },
    ]);
  }, [setFooterHints]);

  const settings = useMemo(() => {
    const current = config ?? {};
    return [
      {
        key: "apiUrl" as const,
        label: "API URL",
        value: current.apiUrl ?? DEFAULT_API_URL,
        editable: false,
      },
      {
        key: "default.lang" as const,
        label: "Default language",
        value: current.default?.lang ?? "—",
        editable: true,
      },
      {
        key: "default.limit" as const,
        label: "Default page limit",
        value: current.default?.limit?.toString() ?? "—",
        editable: true,
      },
      {
        key: "workspaceId" as const,
        label: "Active workspace",
        value: current.workspaceId ?? "—",
        editable: false,
      },
    ];
  }, [config]);

  const confirmEdit = useCallback(async () => {
    if (!editingKey) return;
    if (!config) return;

    setNotice(null);
    setError(null);

    const nextConfig: XevolConfig = { ...config };

    if (editingKey === "apiUrl") {
      const trimmed = editValue.trim();
      nextConfig.apiUrl = trimmed.length > 0 ? trimmed : undefined;
    }

    if (editingKey === "default.lang") {
      const trimmed = editValue.trim() as LanguageCode;
      const lang = LANGUAGES.includes(trimmed) ? trimmed : "en";
      nextConfig.default = { ...nextConfig.default, lang };
    }

    if (editingKey === "default.limit") {
      const parsed = Number(editValue.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Default page limit must be a positive number.");
        return;
      }
      nextConfig.default = { ...nextConfig.default, limit: parsed };
    }

    try {
      await writeConfig(nextConfig);
      setConfig(nextConfig);
      setNotice("Saved settings.");
      setEditingKey(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [config, editValue, editingKey]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    if (editingKey) {
      if (key.escape) {
        setEditingKey(null);
        setEditValue("");
        setNotice("Edit canceled.");
        return;
      }

      if (key.tab) {
        void confirmEdit();
        return;
      }

      if (editingKey === "default.lang") {
        const currentIndex = Math.max(0, LANGUAGES.indexOf(editValue as LanguageCode));
        if (key.upArrow || key.leftArrow) {
          const nextIndex = currentIndex <= 0 ? LANGUAGES.length - 1 : currentIndex - 1;
          setEditValue(LANGUAGES[nextIndex]);
          return;
        }
        if (key.downArrow || key.rightArrow) {
          const nextIndex = currentIndex >= LANGUAGES.length - 1 ? 0 : currentIndex + 1;
          setEditValue(LANGUAGES[nextIndex]);
          return;
        }
        if (key.return) {
          void confirmEdit();
        }
        return;
      }

      return;
    }

    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    if (lower === "r") {
      setLoading(true);
      setError(null);
      setNotice(null);
      void (async () => {
        try {
          const loaded = (await readConfig()) ?? {};
          setConfig(loaded);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(settings.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const setting = settings[selectedIndex];
      if (!setting?.editable) return;
      setEditingKey(setting.key);
      if (setting.key === "default.lang") {
        const initialLang = LANGUAGES.includes(setting.value as LanguageCode)
          ? (setting.value as LanguageCode)
          : "en";
        setEditValue(initialLang);
        return;
      }
      setEditValue(setting.value === "—" ? "" : setting.value);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={colors.primary}>Settings</Text>

      {loading && (
        <Box marginTop={1}>
          <Spinner label="Loading settings…" />
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color={colors.error}>{error} (press r to retry)</Text>
        </Box>
      )}

      {!loading && !error && (
        <Box flexDirection="column" marginTop={1}>
          {settings.map((setting, index) => {
            const isSelected = index === selectedIndex;
            const isEditing = editingKey === setting.key;
            const showInput = isEditing && (setting.key === "apiUrl" || setting.key === "default.limit");
            const showLanguage = isEditing && setting.key === "default.lang";

            return (
              <Box key={setting.key} flexDirection="row" marginBottom={1}>
                <Box width={2}>
                  <Text color={isSelected ? colors.primary : colors.secondary}>{isSelected ? "›" : " "}</Text>
                </Box>
                <Box width={20}>
                  <Text color={isSelected ? colors.primary : undefined}>{setting.label}</Text>
                </Box>
                <Box flexGrow={1}>
                  {showInput ? (
                    <TextInput value={editValue} onChange={setEditValue} onSubmit={() => void confirmEdit()} />
                  ) : showLanguage ? (
                    <Text color={colors.primary}>{editValue || setting.value}</Text>
                  ) : (
                    <Text color={colors.secondary}>{setting.value}</Text>
                  )}
                </Box>
              </Box>
            );
          })}
          <Text color={colors.secondary}>Workspace changes use the workspace switch.</Text>
        </Box>
      )}

      {editingKey === "default.lang" && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>Use ↑/↓ to change language · Enter/Tab to confirm</Text>
        </Box>
      )}

      {notice && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>{notice}</Text>
        </Box>
      )}
    </Box>
  );
}
