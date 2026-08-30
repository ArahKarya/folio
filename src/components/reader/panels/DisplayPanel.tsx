import { AccentSwatches, ThemeSwatches } from "@/components/settings/ThemePicker";
import { Segmented, Slider, Switch } from "@/components/ui/Controls";
import { FONTS, type FontId } from "@/lib/theme";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";

export function DisplayPanel() {
  const format = useReader((state) => state.book?.format);
  const {
    activeTheme,
    accent,
    setTheme,
    setAccent,
    typography,
    setTypography,
    behavior,
    setBehavior,
  } = useSettings();
  const isComic = format === "comic";
  const isFixed = isComic || format === "pdf";

  return (
    <div className="space-y-5 px-4 py-4">
      <section>
        <h3 className="mb-2 text-[13px] text-dim">Theme</h3>
        <ThemeSwatches value={activeTheme} onChange={setTheme} accent={accent} />
      </section>

      <section>
        <h3 className="mb-2 text-[13px] text-dim">Accent</h3>
        <AccentSwatches value={accent} onChange={setAccent} />
      </section>

      {isComic ? (
        <>
          <Segmented
            label="Layout"
            value={behavior.comicMode}
            onChange={(comicMode) => setBehavior({ comicMode })}
            options={[
              { value: "single", label: "Single" },
              { value: "spread", label: "Two-up" },
              { value: "strip", label: "Strip" },
            ]}
          />
          <Segmented
            label="Fit"
            value={behavior.comicFit}
            onChange={(comicFit) => setBehavior({ comicFit })}
            options={[
              { value: "width", label: "Width" },
              { value: "height", label: "Height" },
              { value: "page", label: "Whole page" },
            ]}
          />
        </>
      ) : null}

      {!isFixed ? (
        <>
          <Segmented
            label="Typeface"
            value={typography.font}
            onChange={(font: FontId) => setTypography({ font })}
            options={FONTS.map((item) => ({ value: item.id, label: item.label }))}
          />

          <Slider
            label="Text size"
            min={13}
            max={34}
            value={typography.fontSize}
            display={`${typography.fontSize}px`}
            onChange={(fontSize) => setTypography({ fontSize })}
          />

          <Slider
            label="Line height"
            min={1.15}
            max={2.4}
            step={0.05}
            value={typography.lineHeight}
            display={typography.lineHeight.toFixed(2)}
            onChange={(lineHeight) => setTypography({ lineHeight })}
          />

          <Slider
            label="Paragraph spacing"
            min={0}
            max={2}
            step={0.05}
            value={typography.paragraphSpacing}
            display={`${typography.paragraphSpacing.toFixed(2)}em`}
            onChange={(paragraphSpacing) => setTypography({ paragraphSpacing })}
          />

          <Slider
            label="Letter spacing"
            min={-0.02}
            max={0.12}
            step={0.005}
            value={typography.letterSpacing}
            display={`${typography.letterSpacing.toFixed(3)}em`}
            onChange={(letterSpacing) => setTypography({ letterSpacing })}
          />

          <Segmented
            label="Columns"
            value={typography.columns}
            onChange={(columns) => setTypography({ columns })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "single", label: "One" },
              { value: "double", label: "Two" },
            ]}
          />

          <Switch
            label="Justify text"
            hint="Even right edge, with hyphenation"
            checked={typography.justify}
            onChange={(justify) => setTypography({ justify })}
          />
        </>
      ) : null}

      <Slider
        label="Page margins"
        min={0}
        max={22}
        value={typography.margin}
        display={`${typography.margin}%`}
        onChange={(margin) => setTypography({ margin })}
      />

      <div className="space-y-2 border-t border-line pt-3">
        <Segmented
          label="Page transition"
          value={behavior.pageTransition}
          onChange={(pageTransition) => setBehavior({ pageTransition })}
          options={[
            { value: "slide", label: "Slide" },
            { value: "fade", label: "Fade" },
            { value: "none", label: "None" },
          ]}
        />
        <Switch
          label="Tap edges to turn pages"
          hint="Click or tap the left and right thirds"
          checked={behavior.tapZones}
          onChange={(tapZones) => setBehavior({ tapZones })}
        />
        <Switch
          label="Show time remaining"
          checked={behavior.showRemaining}
          onChange={(showRemaining) => setBehavior({ showRemaining })}
        />
        {!isFixed ? (
          <Switch
            label="Chapter marks on the progress bar"
            hint="Hidden automatically when a book's chapters cannot be placed"
            checked={behavior.showChapterMarks}
            onChange={(showChapterMarks) => setBehavior({ showChapterMarks })}
          />
        ) : null}
      </div>
    </div>
  );
}
