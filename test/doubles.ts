import type { CqlComposerLike } from '../src/core/index.js';
import type { ArbiterLike, MapPointerLike } from '../src/ol/index.js';

type Handlers = Parameters<ArbiterLike['claim']>[1];

export interface FakeComposer extends CqlComposerLike {
    calls: [string, string | null][];
}

export const fakeComposer = (): FakeComposer => {
    const calls: [string, string | null][] = [];
    return { calls, set: (name, fragment) => { calls.push([name, fragment]); } };
};

export interface FakeArbiter extends ArbiterLike {
    claims: string[];
    active(): string | null;
    click(pointer: MapPointerLike): void;
}

export const fakeArbiter = (): FakeArbiter => {
    const claims: string[] = [];
    let current: { tool: string; handlers: Handlers } | null = null;
    return {
        claims,
        claim(tool, handlers) {
            claims.push(tool);
            const previous = current;
            const own = { tool, handlers };
            current = own;
            if (previous && previous.tool !== tool) previous.handlers.escape?.();
            return () => {
                if (current === own) current = null;
            };
        },
        active: () => current?.tool ?? null,
        click: pointer => current?.handlers.click?.(pointer),
    };
};
