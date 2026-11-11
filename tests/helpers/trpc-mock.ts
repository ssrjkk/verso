/* eslint-disable @typescript-eslint/no-explicit-any */
// Управляемый мок tRPC-клиента для компонентных тестов.
// Позволяет задать данные запросов/мутаций и шпионить за utils.invalidate().
import { vi, type Mock } from "vitest";

type QueryConfig = {
  data?: unknown;
  isPending?: boolean;
  isError?: boolean;
  error?: Error;
};

type MutationConfig = {
  result?: unknown;
  error?: Error;
  isPending?: boolean;
  isError?: boolean;
};

const queryConfigs = new Map<string, QueryConfig>();
const lastQueryArgs = new Map<string, unknown[]>();
const queryRefetches = new Map<string, Mock>();
const mutationConfigs = new Map<string, MutationConfig>();
const mutationOptions = new Map<string, any>();
const mutationFns = new Map<string, { mutate: Mock; mutateAsync: Mock; reset: Mock }>();
const utilsMocks = new Map<string, Mock>();

function getRefetch(path: string): Mock {
  let fn = queryRefetches.get(path);
  if (!fn) {
    fn = vi.fn(() => Promise.resolve());
    queryRefetches.set(path, fn);
  }
  return fn;
}

export function setQuery(path: string, config: QueryConfig): void {
  queryConfigs.set(path, config);
}

export function queryArgs(path: string): unknown[] | undefined {
  return lastQueryArgs.get(path);
}

export function queryRefetch(path: string): Mock {
  return getRefetch(path);
}

export function setMutation(path: string, config: MutationConfig): void {
  mutationConfigs.set(path, config);
}

export function mutation(path: string): { mutate: Mock; mutateAsync: Mock; reset: Mock } {
  return getMutationFns(path);
}

export function utilsMock(path: string): Mock {
  let fn = utilsMocks.get(path);
  if (!fn) {
    fn = vi.fn();
    utilsMocks.set(path, fn);
  }
  return fn;
}

function getMutationFns(path: string) {
  let fn = mutationFns.get(path);
  if (!fn) {
    const mutate = vi.fn((input: unknown, callOptions?: any) =>
      runMutation(path, input, callOptions),
    );
    const mutateAsync = vi.fn((input: unknown, callOptions?: any) =>
      runMutation(path, input, callOptions, true),
    );
    fn = { mutate, mutateAsync, reset: vi.fn() };
    mutationFns.set(path, fn);
  }
  return fn;
}

function runMutation(path: string, input: unknown, callOptions?: any, asyncMode = false) {
  const config = mutationConfigs.get(path) ?? {};
  const options = mutationOptions.get(path);
  if (config.error) {
    config.isError = true;
    options?.onError?.(config.error, input, undefined);
    callOptions?.onError?.(config.error, input, undefined);
    return asyncMode ? Promise.reject(config.error) : undefined;
  }
  const result = config.result;
  options?.onSuccess?.(result, input, undefined);
  callOptions?.onSuccess?.(result, input, undefined);
  return asyncMode ? Promise.resolve(result) : result;
}

function queryHook(path: string) {
  return (...args: unknown[]) => {
    lastQueryArgs.set(path, args);
    return {
      get data() {
        return queryConfigs.get(path)?.data;
      },
      get isPending() {
        return queryConfigs.get(path)?.isPending ?? false;
      },
      get isLoading() {
        return queryConfigs.get(path)?.isPending ?? false;
      },
      get isError() {
        return queryConfigs.get(path)?.isError ?? false;
      },
      get error() {
        return queryConfigs.get(path)?.error ?? null;
      },
      refetch: getRefetch(path),
    };
  };
}

function mutationHook(path: string) {
  return (options?: unknown) => {
    mutationOptions.set(path, options);
    return {
      ...getMutationFns(path),
      get isPending() {
        return mutationConfigs.get(path)?.isPending ?? false;
      },
      get isError() {
        return mutationConfigs.get(path)?.isError ?? false;
      },
      get error() {
        return mutationConfigs.get(path)?.error ?? null;
      },
      get data() {
        return mutationConfigs.get(path)?.result;
      },
    };
  };
}

function utilsProxy(path = ""): any {
  return new Proxy(function utilsStub() {}, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (typeof prop !== "string") return undefined;
      return utilsProxy(path ? `${path}.${prop}` : prop);
    },
    apply(_target, _thisArg, args: unknown[]) {
      return utilsMock(path)(...args);
    },
  });
}

function group(path: string): any {
  return new Proxy(function trpcGroup() {}, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "useQuery" || prop === "useInfiniteQuery") return queryHook(path);
      if (prop === "useMutation") return mutationHook(path);
      if (prop === "useUtils") return () => utilsProxy();
      return group(path ? `${path}.${prop}` : prop);
    },
  });
}

export const trpc = group("");

export function resetTrpcMock(): void {
  queryConfigs.clear();
  lastQueryArgs.clear();
  queryRefetches.clear();
  mutationConfigs.clear();
  mutationOptions.clear();
  mutationFns.clear();
  utilsMocks.clear();
}
