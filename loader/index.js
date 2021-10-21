// This is a patch for mozilla/source-map#349 -
// internally, it uses the existence of the `fetch` global to toggle browser behaviours.
// That check, however, will break when `fetch` polyfills are used for SSR setups.
// We "reset" the polyfill here to ensure it won't interfere with source-map generation.
const originalFetch = global.fetch;
delete global.fetch;

const { getOptions } = require('loader-utils');
const { validate: validateOptions } = require('schema-utils');
const { SourceMapConsumer, SourceNode } = require('source-map');
const {
  getIdentitySourceMap,
  getModuleSystem,
  getRefreshModuleRuntime,
  normalizeOptions,
} = require('./utils');
const schema = require('./options.json');

const RefreshRuntimePath = require
  .resolve('react-refresh/runtime.js')
  .replace(/\\/g, '/')
  .replace(/'/g, "\\'");

/**
 * A simple Webpack loader to inject react-refresh HMR code into modules.
 *
 * [Reference for Loader API](https://webpack.js.org/api/loaders/)
 * @this {import('webpack').loader.LoaderContext}
 * @param {string} source The original module source code.
 * @param {import('source-map').RawSourceMap} [inputSourceMap] The source map of the module.
 * @param {*} [meta] The loader metadata passed in.
 * @returns {void}
 */
function ReactRefreshLoader(source, inputSourceMap, meta) {
  let options = getOptions(this);
  validateOptions(schema, options, {
    baseDataPath: 'options',
    name: 'React Refresh Loader',
  });

  options = normalizeOptions(options);

  const callback = this.async();

  const { ModuleFilenameHelpers, Template } = this._compiler.webpack || require('webpack');

  const RefreshSetupRuntimes = {
    cjs: Template.asString(
      `__webpack_require__.$Refresh$.runtime = require('${RefreshRuntimePath}');`
    ),
    esm: Template.asString([
      `import * as __react_refresh_runtime__ from '${RefreshRuntimePath}';`,
      `__webpack_require__.$Refresh$.runtime = __react_refresh_runtime__;`,
    ]),
  };

  /**
   * @this {import('webpack').loader.LoaderContext}
   * @param {string} source
   * @param {import('source-map').RawSourceMap} [inputSourceMap]
   * @returns {Promise<[string, import('source-map').RawSourceMap]>}
   */
  async function _loader(source, inputSourceMap) {
    const moduleSystem = await getModuleSystem.call(this, ModuleFilenameHelpers, options);

    const RefreshSetupRuntime = RefreshSetupRuntimes[moduleSystem];
    const RefreshModuleRuntime = getRefreshModuleRuntime(Template, {
      const: options.const,
      moduleSystem,
    });

    // This code adds significant startup time to our local Webpack build, so we are
    // commenting it out for now. This enables a more accurate debugging experience
    // in our source maps (e.g. your selected line doesn't ever jump around), but it
    // is not enough of an improvement or necessity to justify the additional 2 minutes
    // it adds to our initial build times.

    // if (this.sourceMap) {
    //   let originalSourceMap = inputSourceMap;
    //   if (!originalSourceMap) {
    //     originalSourceMap = getIdentitySourceMap(source, this.resourcePath);
    //   }

    //   const node = SourceNode.fromStringWithSourceMap(
    //     source,
    //     await new SourceMapConsumer(originalSourceMap)
    //   );

    //   node.prepend([RefreshSetupRuntime, '\n\n']);
    //   node.add(['\n\n', RefreshModuleRuntime]);

    //   const { code, map } = node.toStringWithSourceMap();
    //   return [code, map.toJSON()];
    // } else {
    //   return [[RefreshSetupRuntime, source, RefreshModuleRuntime].join('\n\n'), inputSourceMap];
    // }

    return [[RefreshSetupRuntime, source, RefreshModuleRuntime].join('\n\n'), inputSourceMap];
  }

  _loader.call(this, source, inputSourceMap).then(
    ([code, map]) => {
      callback(null, code, map, meta);
    },
    (error) => {
      callback(error);
    }
  );
}

module.exports = ReactRefreshLoader;

// Restore the original value of the `fetch` global, if it exists
if (originalFetch) {
  global.fetch = originalFetch;
}
