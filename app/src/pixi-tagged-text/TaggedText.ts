import {
  DisplayObject,
  Text,
  ITextStyle,
  Sprite,
  IDestroyOptions,
  Graphics,
  Container,
  Texture,
} from "pixi.js";
import {
  TaggedTextOptions,
  TextStyleSet,
  TextStyleExtended,
  TagWithAttributes,
  AttributesList,
  IMG_REFERENCE_PROPERTY,
  SegmentToken,
  isSpriteToken,
  TextSegmentToken,
  isTextToken,
  isNewlineToken,
  isWhitespaceToken,
  Point,
  ParagraphToken,
  TextDecorationMetrics,
  DEFAULT_KEY,
} from "./types.js";

import { parseTagsNew, removeTags } from "./tags.js";
import {
  combineAllStyles,
  convertUnsupportedAlignment,
  getStyleForTag as getStyleForTagExt,
  mapTagsToStyles,
} from "./style.js";
import { calculateTokens, getBoundsNested } from "./layout.js";
import { fontSizeStringToNumber } from "./pixiUtils.js";

import DEFAULT_STYLE from "./defaultStyle.js";
import { MIPMAP_MODES, SCALE_MODES } from "pixi.js";

const DEBUG = {
  WORD_STROKE_COLOR: 0xffcccc,
  WORD_FILL_COLOR: 0xeeeeee,
  TEXT_FIELD_STROKE_COLOR: 0xff00ff,
  WHITESPACE_COLOR: 0xcccccc,
  WHITESPACE_STROKE_COLOR: 0xaaaaaa,
  BASELINE_COLOR: 0xffff99,
  LINE_COLOR: 0xffff00,
  OUTLINE_COLOR: 0xffcccc,
  OUTLINE_SHADOW_COLOR: 0x000000,
  TEXT_STYLE: {
    fontFamily: "courier",
    fontSize: 10,
    fill: 0xffffff,
    dropShadow: true,
  },
};

const DEFAULT_OPTIONS: TaggedTextOptions = {
  debug: false,
  splitStyle: "words",
  imgMap: {},
  scaleIcons: true,
  skipUpdates: false,
  skipDraw: false,
  drawWhitespace: false,
  overdrawDecorations: 0,
};

const DEFAULT_STYLE_SET = { default: DEFAULT_STYLE };
Object.freeze(DEFAULT_STYLE_SET);
Object.freeze(DEFAULT_STYLE);

const DEFAULT_DESTROY_OPTIONS: IDestroyOptions = {
  children: true,
  texture: true,
};

export default class TaggedText extends Sprite {
  public static get defaultStyles(): TextStyleSet {
    return DEFAULT_STYLE_SET;
  }
  public static get defaultOptions(): TaggedTextOptions {
    return DEFAULT_OPTIONS;
  }

  /** Settings for the TaggedText component. */
  private _options: TaggedTextOptions;
  public get options(): TaggedTextOptions {
    return this._options;
  }

  private _needsUpdate = true;
  public get needsUpdate(): boolean {
    return this._needsUpdate;
  }
  private _needsDraw = true;
  public get needsDraw(): boolean {
    return this._needsDraw;
  }

  private _tokens: ParagraphToken = [];
  /**
   * Tokens representing parsed out and styled tagged text. This is generated by update.
   * They contain all the information needed to render the text fields and other children in your component.
   */
  public get tokens(): ParagraphToken {
    return this._tokens;
  }
  public get tokensFlat(): SegmentToken[] {
    return this._tokens.flat(3);
  }

  private _text = "";
  public get text(): string {
    return this._text;
  }

  /**
   * Alternative implicit setter for text. Always uses default for skipUpdate.
   */
  public set text(text: string) {
    this.setText(text);
  }

  /**
   * Setter for text that allows you to override the default for skipping the update.
   * @param text Text to add to component with (optional) tags.
   * @param skipUpdate *For advanced users* overrides default for upating / redrawing after changing the text.
   * When true, setText() never updates even if default is false, and vice versa.
   * Options are true, false, or undefined. Undefined is the default and means it uses whatever setting
   * is provided in this.options.
   */
  public setText(text: string, skipUpdate?: boolean): void {
    if (text === this._text && this._needsUpdate === false) {
      return;
    }
    this._text = text;
    this._needsUpdate = true;
    this.updateIfShould(skipUpdate);
  }

  /**
   * Returns the text content with all tags stripped out.
   */
  public get untaggedText(): string {
    return removeTags(this.text);
  }

  private _tagStyles: TextStyleSet = {};
  public get tagStyles(): TextStyleSet {
    return this._tagStyles;
  }

  /**
   * Alternative implicit setter for tagStyles. Always uses default for skipUpdate.
   */
  public set tagStyles(styles: TextStyleSet) {
    this.setTagStyles(styles);
  }

  /**
   * Setter for tagStyles.
   * @param styles Object with strings for keys representing tag names, mapped to style objects.
   * @param skipUpdate *For advanced users* overrides default for upating / redrawing after changing the styles.
   * When true, setTagStyles() never updates even if default is false, and vice versa.
   * Options are true, false, or undefined. Undefined is the default and means it uses whatever setting
   * is provided in this.options.
   */
  public setTagStyles(styles: TextStyleSet, skipUpdate?: boolean): void {
    Object.entries(styles).forEach(([tag, style]) =>
      this.setStyleForTag(tag, style, true),
    );

    this._needsUpdate = true;
    this.updateIfShould(skipUpdate);
  }

  public getStyleForTag(
    tag: string,
    attributes: AttributesList = {},
  ): TextStyleExtended | undefined {
    return getStyleForTagExt(tag, this.tagStyles, attributes);
  }

  public getStyleForTags(tags: TagWithAttributes[]): TextStyleExtended {
    const styles = tags.map(({ tagName, attributes }) =>
      this.getStyleForTag(tagName, attributes),
    );
    return combineAllStyles(styles);
  }

  /**
   * Set a style to be used by a single tag.
   * @param tag Name of the tag to set style for
   * @param styles Style object to assign to the tag.
   * @param skipUpdate *For advanced users* overrides default for upating / redrawing after changing the styles.
   * When true, setStyleForTag() never updates even if default is false, and vice versa.
   * Options are true, false, or undefined. Undefined is the default and means it uses whatever setting
   * is provided in this.options.
   */
  public setStyleForTag(
    tag: string,
    styles: TextStyleExtended,
    skipUpdate?: boolean,
  ): boolean {
    this.tagStyles[tag] = styles;

    // Override some settings on default styles.
    if (tag === DEFAULT_KEY && this.defaultStyle[IMG_REFERENCE_PROPERTY]) {
      // prevents accidentally setting all text to images.
      console.warn(
        `${IMG_REFERENCE_PROPERTY}-on-default`,
        `Style "${IMG_REFERENCE_PROPERTY}" can not be set on the "${DEFAULT_KEY}" style because it will add images to EVERY tag!`,
      );
      this.defaultStyle[IMG_REFERENCE_PROPERTY] = undefined;
    }

    this._needsUpdate = true;
    this.updateIfShould(skipUpdate);

    return true;
  }
  /**
   * Removes a style associated with a tag. Note, inline attributes are not affected.
   * @param tag Name of the tag to delete the style of.
   * @param skipUpdate *For advanced users* overrides default for upating / redrawing after changing the styles.
   * When true, removeStylesForTag() never updates even if default is false, and vice versa.
   * Options are true, false, or undefined. Undefined is the default and means it uses whatever setting
   * is provided in this.options.
   */
  public removeStylesForTag(tag: string, skipUpdate?: boolean): boolean {
    if (tag in this.tagStyles) {
      delete this.tagStyles[tag];

      this._needsUpdate = true;
      this.updateIfShould(skipUpdate);

      return true;
    }
    return false;
  }

  public get defaultStyle(): TextStyleExtended {
    return this.tagStyles?.default;
  }
  /**
   * Alternative implicit setter for defaultStyle. Always uses default for skipUpdate.
   */
  public set defaultStyle(defaultStyles: TextStyleExtended) {
    this.setDefaultStyle(defaultStyles);
  }
  /**
   * Setter for default styles. A shortcut to this.setStyleForTag("default",...)
   * @param styles A style object to use as the default styles for all text in the component.
   * @param skipUpdate *For advanced users* overrides default for upating / redrawing after changing the styles.
   * When true, setDefaultStyle() never updates even if default is false, and vice versa.
   * Options are true, false, or undefined. Undefined is the default and means it uses whatever setting
   * is provided in this.options.
   */
  public setDefaultStyle(
    defaultStyles: TextStyleExtended,
    skipUpdate?: boolean,
  ): void {
    this.setStyleForTag(DEFAULT_KEY, defaultStyles, skipUpdate);
  }

  // References to internal elements.
  private _textFields: Text[] = [];
  public get textFields(): Text[] {
    return this._textFields;
  }
  private _sprites: Sprite[] = [];
  public get sprites(): Sprite[] {
    return this._sprites;
  }
  private _decorations: Graphics[] = [];
  public get decorations(): Graphics[] {
    return this._decorations;
  }
  private _spriteTemplates: Record<string, Sprite> = {};
  public get spriteTemplates(): Record<string, Sprite> {
    return this._spriteTemplates;
  }
  private _debugGraphics: Graphics;

  // Containers for children
  private _textContainer: Container;
  public get textContainer(): Container {
    return this._textContainer;
  }

  private _decorationContainer: Container;
  public get decorationContainer(): Container {
    return this._decorationContainer;
  }

  private _spriteContainer: Container;
  public get spriteContainer(): Container {
    return this._spriteContainer;
  }
  private _debugContainer: Container;
  public get debugContainer(): Container {
    return this._debugContainer;
  }

  constructor(
    text = "",
    tagStyles: TextStyleSet = {},
    options: TaggedTextOptions = {},
    texture?: Texture,
  ) {
    super(texture);

    this._textContainer = new Container();
    this._spriteContainer = new Container();
    this._decorationContainer = new Container();
    this._debugContainer = new Container();
    this._debugGraphics = new Graphics();

    this.resetChildren();

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    this._options = mergedOptions;

    tagStyles = { default: {}, ...tagStyles };

    const mergedDefaultStyles = { ...DEFAULT_STYLE, ...tagStyles.default };

    tagStyles.default = mergedDefaultStyles;

    this.tagStyles = tagStyles;

    if (this.options.imgMap) {
      this._spriteTemplates = this.options.imgMap;
    }

    this.text = text;
  }

  public destroyImgMap(): void {
    if (this.destroyed) {
      throw new Error(
        "destroyImgMap() was called after this object was already destroyed. You must call destroyImgMap() before destroy() because imgMap is cleared when the object is destroyed.",
      );
    }

    this._spriteContainer.destroy({
      children: true,
      texture: true,
      baseTexture: true,
    });
  }

  public destroy(options?: boolean | IDestroyOptions): void {
    let destroyOptions: IDestroyOptions = {};
    if (typeof options === "boolean") {
      options = { children: options };
    }
    destroyOptions = { ...DEFAULT_DESTROY_OPTIONS, ...options };

    // Do not destroy the sprites in the imgMap.
    this._spriteContainer.destroy(false);

    super.destroy(destroyOptions);

    this._textFields = [];
    this._sprites = [];
    this._decorations = [];
    this._spriteTemplates = {};
    this._tokens = [];
    this._tagStyles = {};
    this._options.imgMap = {};
    this._options.skipUpdates = true;
    this._options.skipDraw = true;
    this._options = {};
  }

  /**
   * Removes all PIXI children from this component's containers.
   * Deletes references to sprites and text fields.
   */
  protected resetChildren() {
    if (this._textContainer) {
      this._textContainer.removeChildren();
      this.removeChild(this._textContainer);
    }
    this._textContainer = new Container();
    this.addChild(this._textContainer);

    if (this._spriteContainer) {
      this._spriteContainer.removeChildren();
      this.removeChild(this._spriteContainer);
    }
    this._spriteContainer = new Container();
    this.addChild(this._spriteContainer);

    if (this._decorationContainer) {
      this._decorationContainer.removeChildren();
      this.removeChild(this._decorationContainer);
    }
    this._decorationContainer = new Container();
    this.addChild(this._decorationContainer);

    if (this._debugContainer) {
      this._debugContainer.removeChildren();
      this.removeChild(this._debugContainer);
    }
    this._debugContainer = new Container();
    this.addChild(this._debugContainer);

    this._textFields = [];
    this._sprites = [];
    this._decorations = [];
  }

  /**
   * Determines whether to call update based on the parameter and the options set then calls it or sets needsUpdate to true.
   * @param forcedSkipUpdate This is the parameter provided to some functions that allow you to skip the update.
   * It's factored in along with the defaults to figure out what to do.
   */
  private updateIfShould(forcedSkipUpdate?: boolean): boolean {
    if (
      forcedSkipUpdate === false ||
      (forcedSkipUpdate === undefined && this.options.skipUpdates === false)
    ) {
      this.update();
      return true;
    }
    return false;
  }

  /**
   * Calculates styles, positioning, etc. of the text and styles and creates a
   * set of objects that represent where each portion of text and image should
   * be drawn.
   * @param skipDraw *For advanced users* overrides default for redrawing the styles.
   * When true, update() will skip the call to draw() (even if the default is false).
   * Options are true, false, or undefined. Undefined is the default and means it uses whatever setting
   * is provided in this.options.
   */
  public update(skipDraw?: boolean): ParagraphToken {
    // Determine default style properties
    const tagStyles = this.tagStyles;
    const { splitStyle, scaleIcons } = this.options;
    const spriteTemplates = this.options.imgMap && this.spriteTemplates;

    // Pre-process text.
    // Parse tags in the text.
    const tagTokensNew = parseTagsNew(this.text);
    // Assign styles to each segment.
    const styledTokens = mapTagsToStyles(
      tagTokensNew,
      tagStyles,
      spriteTemplates,
    );
    // Measure font for each style
    // Measure each segment
    // Create the text segments, position and add them. (draw)
    const newFinalTokens = calculateTokens(
      styledTokens,
      splitStyle,
      scaleIcons,
      this.options.adjustFontBaseline,
    );

    this._tokens = newFinalTokens;
    this._needsDraw = true;

    this.drawIfShould(skipDraw);

    this._needsUpdate = false;

    return newFinalTokens;
  }

  /**
   * Determines whether to call draw() based on the parameter and the options set then calls it or sets needsDraw to true.
   * @param forcedSkipDraw This is the parameter provided to some functions that allow you to skip the update.
   * It's factored in along with the defaults to figure out what to do.
   */
  private drawIfShould(forcedSkipDraw?: boolean): boolean {
    if (
      forcedSkipDraw === false ||
      (forcedSkipDraw === undefined && this.options.skipDraw === false)
    ) {
      this.draw();
      return true;
    }

    return false;
  }

  /**
   * Create and position the display objects based on the tokens.
   */
  public draw(): void {
    this.resetChildren();
    if (this.textContainer === null || this.spriteContainer === null) {
      throw new Error(
        "Somehow the textContainer or spriteContainer is null. This shouldn't be possible. Perhaps you've destroyed this object?",
      );
    }
    const textContainer = this.textContainer;
    const spriteContainer = this.spriteContainer;

    const { drawWhitespace } = this.options;
    const tokens = drawWhitespace
      ? this.tokensFlat
      : // remove any tokens that are purely whitespace unless drawWhitespace is specified
        this.tokensFlat.filter(segment => !isWhitespaceToken(segment));

    let displayObject: Container;

    tokens.forEach(t => {
      if (isTextToken(t)) {
        displayObject = this.createTextFieldForToken(t as TextSegmentToken);
        textContainer.addChild(displayObject as DisplayObject);
        this.textFields.push(displayObject as Text);

        if (t.textDecorations && t.textDecorations.length > 0) {
          for (const d of t.textDecorations) {
            const drawing = this.createDrawingForTextDecoration(d);
            displayObject.addChild(drawing as DisplayObject);
            this._decorations.push(drawing);
          }
        }
      }
      if (isSpriteToken(t)) {
        displayObject = t.content as Sprite;

        this.sprites.push(displayObject as Sprite);
        spriteContainer.addChild(displayObject as DisplayObject);
      }

      const { bounds } = t;
      displayObject.x = bounds.x;
      displayObject.y = bounds.y;
    });

    if (this.options.debug) {
      this.drawDebug();
    }
    this._needsDraw = false;
  }

  protected createDrawingForTextDecoration(
    textDecoration: TextDecorationMetrics,
  ): Graphics {
    const { overdrawDecorations: overdraw = 0 } = this.options;
    const { bounds } = textDecoration;
    let { color } = textDecoration;
    const drawing = new Graphics();

    if (typeof color === "string") {
      if (color.indexOf("#") === 0) {
        color = "0x" + color.substring(1);
        color = parseInt(color, 16) as number;
      } else {
        console.warn(
          "invalid-color",
          "Sorry, at this point, only hex colors are supported for textDecorations like underlines. Please use either a hex number like 0x66FF33 or a string like '#66FF33'",
        );
      }
    }

    // the min , max here prevents the overdraw from producing a negative width drawing.
    const { y, height } = bounds;
    const midpoint = bounds.x + bounds.width / 2;
    const x = Math.min(bounds.x - overdraw, midpoint);
    const width = Math.max(bounds.width + overdraw * 2, 0);

    drawing
      .beginFill(color as number)
      .drawRect(x, y, width, height)
      .endFill();

    return drawing;
  }

  protected createTextField(text: string, style: ITextStyle): Text {
    const textField = new Text(text, style);

    textField.texture.baseTexture.scaleMode = SCALE_MODES.LINEAR;
    textField.texture.baseTexture.mipmap = MIPMAP_MODES.OFF;

    return textField;
  }

  protected createTextFieldForToken(token: TextSegmentToken): Text {
    let text = token.content;

    const alignClassic = convertUnsupportedAlignment(token.style.align);
    const sanitizedStyle = {
      ...token.style,
      align: alignClassic,
    } as TextStyleExtended;

    const textField = this.createTextField(text, sanitizedStyle as ITextStyle);

    let { fontScaleWidth = 1.0, fontScaleHeight = 1.0 } = token.style;
    fontScaleWidth =
      isNaN(fontScaleWidth) || fontScaleWidth < 0 ? 0 : fontScaleWidth;
    fontScaleHeight =
      isNaN(fontScaleHeight) || fontScaleHeight < 0 ? 0 : fontScaleHeight;

    let finalScaleWidth = fontScaleWidth;
    let finalScaleHeight = fontScaleHeight;
    const largerScale = Math.max(fontScaleWidth, fontScaleHeight);

    if (largerScale > 1) {
      if (largerScale === fontScaleHeight) {
        finalScaleWidth /= largerScale;
        finalScaleHeight = 1.0;
      } else {
        finalScaleHeight /= largerScale;
        finalScaleWidth = 1.0;
      }

      const fs = textField.style.fontSize ?? 0;
      const fontSizePx =
        (typeof fs === "string" ? fontSizeStringToNumber(fs) : fs) *
        largerScale;

      textField.style.fontSize = fontSizePx;
    }

    textField.scale.set(finalScaleWidth, finalScaleHeight);

    return textField;
  }

  public drawDebug(): void {
    const paragraph = this.tokens;
    this._debugGraphics = new Graphics();

    this.debugContainer.addChild(this._debugGraphics);

    const g = this._debugGraphics;
    g.clear();

    function createInfoText(text: string, position: Point): Text {
      const info = new Text(text, DEBUG.TEXT_STYLE);
      info.x = position.x + 1;
      info.y = position.y + 1;
      return info;
    }

    for (let lineNumber = 0; lineNumber < paragraph.length; lineNumber++) {
      const line = paragraph[lineNumber];
      const lineBounds = getBoundsNested(line);

      if (this.defaultStyle.wordWrap) {
        const w = this.defaultStyle.wordWrapWidth ?? this.width;
        g.endFill()
          .lineStyle(0.5, DEBUG.LINE_COLOR, 0.2)
          .drawRect(0, lineBounds.y, w, lineBounds.height)
          .endFill();
      }

      for (let wordNumber = 0; wordNumber < line.length; wordNumber++) {
        const word = line[wordNumber];
        for (const segmentToken of word) {
          const isSprite = isSpriteToken(segmentToken);
          const { x, y, width } = segmentToken.bounds;
          const baseline =
            y +
            (isSprite
              ? segmentToken.bounds.height
              : segmentToken.fontProperties.ascent);

          let { height } = segmentToken.bounds;
          if (isSprite) {
            height += segmentToken.fontProperties.descent;
          }

          if (
            isWhitespaceToken(segmentToken) &&
            this.options.drawWhitespace === false
          ) {
            g.lineStyle(1, DEBUG.WHITESPACE_STROKE_COLOR, 1).beginFill(
              DEBUG.WHITESPACE_COLOR,
              0.2,
            );
          } else {
            g.lineStyle(1, DEBUG.WORD_STROKE_COLOR, 1).beginFill(
              DEBUG.WORD_FILL_COLOR,
              0.2,
            );
          }

          if (isNewlineToken(segmentToken)) {
            this.debugContainer.addChild(
              createInfoText("↩︎", { x, y: y + 10 }) as DisplayObject,
            );
          } else {
            g.lineStyle(0.5, DEBUG.LINE_COLOR, 0.2)
              .drawRect(x, y, width, height)
              .endFill()

              .lineStyle(1, DEBUG.BASELINE_COLOR, 1)
              .beginFill()
              .drawRect(x, baseline, width, 1)
              .endFill();
          }

          let info;

          if (isTextToken(segmentToken)) {
            info = `${segmentToken.tags}`;
            this.debugContainer.addChild(
              createInfoText(info, { x, y }) as DisplayObject,
            );
          }
        }
      }
    }
  }
}
