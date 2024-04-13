/**
 * A system
 */
export interface System {
  /**
   * The version of the specification, in semver format.
   */
  specificationVersion: "1.0.0";
  /**
   * The title of the system.
   */
  title: string;
  /**
   * The description of the system, in markdown format.
   */
  description?: string;
  /**
   * The sub-systems of the system.
   */
  systems?: Subsystem[];
  /**
   * The links of the system.
   */
  links?: Link[];
  /**
   * The flows of the system.
   */
  flows?: Flow[];
}
/**
 * A sub-system
 */
export interface Subsystem {
  /**
   * The id of the sub-system. Must be unique across the parent system.
   */
  id: string;
  /**
   * The title of the sub-system.
   */
  title?: string;
  /**
   * The description of the sub-system, in markdown format.
   */
  description?: string;
  /**
   * The position of the sub-system in the parent system.
   */
  position?: {
    /**
     * The X position of the sub-system in the parent system.
     */
    x: number;
    /**
     * The Y position of the sub-system in the parent system.
     */
    y: number;
  };
  /**
   * The sub-systems of the system.
   */
  systems?: Subsystem[];
  /**
   * The links of the system.
   */
  links?: Link[];
}
/**
 * A link
 */
export interface Link {
  /**
   * The title of the link.
   */
  title?: string;
  /**
   * The description of the link, in markdown format.
   */
  description?: string;
  /**
   * Side A of the link. Format: subsystemId[.subsystemId]
   */
  a: string;
  /**
   * Side B of the link. Format: subsystemId[.subsystemId]
   */
  b: string;
}
/**
 * A flow
 */
export interface Flow {
  /**
   * The title of the flow.
   */
  title?: string;
  /**
   * The description of the flow, in markdown format.
   */
  description?: string;
  /**
   * The steps of the flow.
   */
  steps: {
    /**
     * The description of the step, in markdown format.
     */
    description?: string;
    /**
     * The keyframe of the step.
     */
    keyframe: number;
    /**
     * Side where the data originates from. Format: subsystemId[.subsystemId]*
     */
    from: string;
    /**
     * Side where the data goes to. Format: subsystemId[.subsystemId]*
     */
    to: string;
    /**
     * The data of the step.
     */
    data?: string;
  }[];
}

const schemas = [
  {
    $id: "https://dataflows.io/flow.json",
    title: "Flow",
    description: "A flow",
    type: "object",
    required: ["steps"],
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        description: "The title of the flow.",
      },
      description: {
        type: "string",
        description: "The description of the flow, in markdown format.",
      },
      steps: {
        type: "array",
        description: "The steps of the flow.",
        items: {
          type: "object",
          required: ["from", "to", "keyframe"],
          additionalProperties: false,
          properties: {
            description: {
              type: "string",
              description: "The description of the step, in markdown format.",
            },
            keyframe: {
              type: "integer",
              minimum: 0,
              description: "The keyframe of the step.",
            },
            from: {
              type: "string",
              pattern: "^[a-z0-9_-]+(\\.[a-z0-9_-]+)*$",
              description:
                "Side where the data originates from. Format: subsystemId[.subsystemId]*",
            },
            to: {
              type: "string",
              pattern: "^[a-z0-9_-]+(\\.[a-z0-9_-]+)*$",
              description:
                "Side where the data goes to. Format: subsystemId[.subsystemId]*",
            },
            data: {
              type: "string",
              description: "The data of the step.",
            },
          },
        },
      },
    },
  },
  {
    $id: "https://dataflows.io/link.json",
    title: "Link",
    description: "A link",
    type: "object",
    required: ["a", "b"],
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        description: "The title of the link.",
      },
      description: {
        type: "string",
        description: "The description of the link, in markdown format.",
      },
      a: {
        type: "string",
        pattern: "^[a-z0-9_-]+(\\.[a-z0-9_-]+){0,1}$",
        description: "Side A of the link. Format: subsystemId[.subsystemId]",
      },
      b: {
        type: "string",
        pattern: "^[a-z0-9_-]+(\\.[a-z0-9_-]+){0,1}$",
        description: "Side B of the link. Format: subsystemId[.subsystemId]",
      },
    },
  },
  {
    $id: "https://dataflows.io/subsystem.json",
    title: "Subsystem",
    description: "A sub-system",
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: {
        type: "string",
        pattern: "^[a-z0-9_-]+$",
        maxLength: 32,
        description:
          "The id of the sub-system. Must be unique across the parent system.",
      },
      title: {
        type: "string",
        description: "The title of the sub-system.",
      },
      description: {
        type: "string",
        description: "The description of the sub-system, in markdown format.",
      },
      position: {
        type: "object",
        description: "The position of the sub-system in the parent system.",
        required: ["x", "y"],
        additionalProperties: false,
        properties: {
          x: {
            type: "integer",
            description:
              "The X position of the sub-system in the parent system.",
            minimum: 0,
            maximum: 64,
          },
          y: {
            type: "integer",
            description:
              "The Y position of the sub-system in the parent system.",
            minimum: 0,
            maximum: 64,
          },
        },
      },
      systems: {
        type: "array",
        description: "The sub-systems of the system.",
        items: {
          $ref: "https://dataflows.io/subsystem.json",
        },
      },
      links: {
        type: "array",
        description: "The links of the system.",
        items: {
          $ref: "https://dataflows.io/link.json",
        },
      },
    },
  },
  {
    $id: "https://dataflows.io/system.json",
    title: "System",
    description: "A system",
    type: "object",
    required: ["specificationVersion", "title"],
    additionalProperties: false,
    properties: {
      specificationVersion: {
        type: "string",
        description: "The version of the specification, in semver format.",
        enum: ["1.0.0"],
      },
      title: {
        type: "string",
        description: "The title of the system.",
      },
      description: {
        type: "string",
        description: "The description of the system, in markdown format.",
      },
      systems: {
        type: "array",
        description: "The sub-systems of the system.",
        items: {
          $ref: "https://dataflows.io/subsystem.json",
        },
      },
      links: {
        type: "array",
        description: "The links of the system.",
        items: {
          $ref: "https://dataflows.io/link.json",
        },
      },
      flows: {
        type: "array",
        description: "The flows of the system.",
        items: {
          $ref: "https://dataflows.io/flow.json",
        },
      },
    },
  },
];

import ajv from "ajv";

export const specification = new ajv({ schemas, allErrors: true });
