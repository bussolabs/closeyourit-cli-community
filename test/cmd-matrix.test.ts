import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiMock, resetApiMock} from './helpers/api-mock'
import {apiError, envelope, GID, runCaptured, runExpectingExit} from './helpers/command'

vi.mock('../src/lib/api', async (io) => {
  const actual = await io<typeof import('../src/lib/api')>()
  const {apiMock} = await import('./helpers/api-mock')
  return {...actual, CliApi: vi.fn(function () { return apiMock })}
})
vi.mock('../src/lib/config', async (io) => {
  const actual = await io<typeof import('../src/lib/config')>()
  return {...actual, loadConfig: vi.fn(() => ({apiUrl: 'https://api.test', token: 'tok_test'}))}
})

import MatrixCategoriesCreate from '../src/commands/matrix/categories/create'
import MatrixCategoriesDelete from '../src/commands/matrix/categories/delete'
import MatrixCategoriesList from '../src/commands/matrix/categories/list'
import MatrixCategoriesUpdate from '../src/commands/matrix/categories/update'
import MatrixCellsClear from '../src/commands/matrix/cells/clear'
import MatrixCellsSet from '../src/commands/matrix/cells/set'
import MatrixFeaturesCreate from '../src/commands/matrix/features/create'
import MatrixFeaturesDelete from '../src/commands/matrix/features/delete'
import MatrixFeaturesList from '../src/commands/matrix/features/list'
import MatrixFeaturesShow from '../src/commands/matrix/features/show'
import MatrixFeaturesUpdate from '../src/commands/matrix/features/update'
import MatrixList from '../src/commands/matrix/list'
import MatrixShow from '../src/commands/matrix/show'
import MatrixStatuses from '../src/commands/matrix/statuses'

beforeEach(() => resetApiMock())

/** Payload shape of `GET /cli/v1/product/matrix/:id` with one feature and two platforms. */
const MATRIX = {
  product: {id: GID, name: 'CloseYourIt'},
  platforms: [
    {id: 'pf-web', code: 'web'},
    {id: 'pf-ios', code: 'ios'},
  ],
  categories: [{id: 'cat-1', name: 'Auth', features: [{id: 'ft-1', name: '2FA'}]}],
  cells: [
    {
      feature_id: 'ft-1',
      platform_id: 'pf-web',
      status: {code: 'available', label: 'Available', category: 'available'},
      release: {version: '2.1.0', project_key: 'CYRA'},
      release_missing: false,
    },
  ],
  missing_release_count: 0,
}

describe('matrix list / statuses', () => {
  it('lists the products', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: GID, name: 'CloseYourIt'}]))
    const {stdout} = await runCaptured(MatrixList, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/product/matrix?page=1')
    expect(stdout).toContain('CloseYourIt')
  })

  it('lists the cell statuses', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 's1', code: 'available', label: 'Available', category: 'available'}]))
    const {stdout} = await runCaptured(MatrixStatuses, [])
    expect(apiMock.get).toHaveBeenCalledWith('/cli/v1/types/feature_statuses')
    expect(stdout).toContain('available')
  })

  it('exits non-zero on an API error', async () => {
    apiMock.get.mockRejectedValue(apiError(403, 'R403-CLIAUTH-002', 'forbidden'))
    const {stderr} = await runExpectingExit(MatrixList, [])
    expect(stderr).toContain('R403-CLIAUTH-002')
  })
})

describe('matrix show', () => {
  it('renders the grid with Category/Feature rows and one column per platform', async () => {
    apiMock.get.mockResolvedValue(envelope(MATRIX))
    const {stdout} = await runCaptured(MatrixShow, [GID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}`)
    expect(stdout).toContain('Auth/2FA')
    expect(stdout).toContain('WEB')
    expect(stdout).toContain('IOS')
    expect(stdout).toContain('available 2.1.0')
    // The untouched crossing reads as "not set", not as an empty column.
    expect(stdout).toContain('-')
  })

  it('flags released cells that carry no version', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        ...MATRIX,
        cells: [{feature_id: 'ft-1', platform_id: 'pf-web', status: {code: 'available'}, release_missing: true}],
        missing_release_count: 1,
      }),
    )
    const {stdout} = await runCaptured(MatrixShow, [GID])
    expect(stdout).toContain('available ?')
    expect(stdout).toContain('1 released cell(s) without a version')
  })

  it('says so when the product has no features yet', async () => {
    apiMock.get.mockResolvedValue(envelope({...MATRIX, categories: [], cells: []}))
    const {stdout} = await runCaptured(MatrixShow, [GID])
    expect(stdout).toContain('No features yet')
  })
})

describe('matrix categories', () => {
  it('list → GET scoped to the product', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'cat-1', name: 'Auth', position: 0}]))
    const {stdout} = await runCaptured(MatrixCategoriesList, [GID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/categories?page=1`)
    expect(stdout).toContain('Auth')
  })

  it('create → POST with name and position', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'Auth'}))
    await runCaptured(MatrixCategoriesCreate, [GID, '--name', 'Auth', '--position', '2'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/categories`, {name: 'Auth', position: 2})
  })

  it('update → PUT by id-or-name with only the changed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({name: 'Access'}))
    await runCaptured(MatrixCategoriesUpdate, [GID, 'Auth', '--name', 'Access'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/categories/Auth`, {name: 'Access'})
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MatrixCategoriesDelete, [GID, 'Auth'], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(MatrixCategoriesDelete, [GID, 'Auth', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/categories/Auth`)
  })
})

describe('matrix features', () => {
  it('list → REFERENCE column carries the Category/Name form', async () => {
    apiMock.get.mockResolvedValue(envelope([{id: 'ft-1', name: '2FA', category_name: 'Auth'}]))
    const {stdout} = await runCaptured(MatrixFeaturesList, [GID])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features?page=1`)
    expect(stdout).toContain('Auth/2FA')
  })

  it('list --category → filter passed through', async () => {
    apiMock.get.mockResolvedValue(envelope([]))
    await runCaptured(MatrixFeaturesList, [GID, '--category', 'Auth'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features?page=1&category=Auth`)
  })

  it('show → escapes the Category/Name reference and names the platform by code', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        id: 'ft-1',
        name: '2FA',
        cells: [{platform_id: 'pf-web', platform_code: 'web', status: {code: 'available'}}],
      }),
    )
    const {stdout} = await runCaptured(MatrixFeaturesShow, [GID, 'Auth/2FA'])
    expect(apiMock.get).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features/Auth%2F2FA`)
    expect(stdout).toContain('available')
    expect(stdout).toContain('web')
    expect(stdout).not.toContain('pf-web')
  })

  it('create → POST maps every optional flag', async () => {
    apiMock.post.mockResolvedValue(envelope({name: '2FA'}))
    await runCaptured(MatrixFeaturesCreate, [
      GID, '--category', 'Auth', '--name', '2FA',
      '--description', 'Second factor', '--position', '1', '--knowledge-page', 'page-1',
    ])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features`, {
      category: 'Auth', name: '2FA', description: 'Second factor', position: 1, knowledge_page_id: 'page-1',
    })
  })

  it('update → PUT with only the changed fields', async () => {
    apiMock.put.mockResolvedValue(envelope({name: 'Two-factor'}))
    await runCaptured(MatrixFeaturesUpdate, [GID, 'Auth/2FA', '--name', 'Two-factor', '--category', 'Notifications'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features/Auth%2F2FA`, {
      name: 'Two-factor', category: 'Notifications',
    })
  })

  it('delete → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MatrixFeaturesDelete, [GID, 'Auth/2FA'], 2)
    expect(message).toContain('Refusing to delete')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('delete → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(MatrixFeaturesDelete, [GID, 'Auth/2FA', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features/Auth%2F2FA`)
  })
})

describe('matrix cells', () => {
  it('set → PUT with status and release, and echoes what was saved', async () => {
    apiMock.put.mockResolvedValue(
      envelope({platform_code: 'web', status: {code: 'available'}, release: {version: '2.1.0'}}),
    )
    const {stdout} = await runCaptured(MatrixCellsSet, [
      GID, 'Auth/2FA', 'web', '--status', 'available', '--release', '2.1.0',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(
      `/cli/v1/product/matrix/${GID}/features/Auth%2F2FA/cells/web`,
      {status: 'available', release: '2.1.0'},
    )
    // status and release are nested: a flat record dump would drop exactly what was just set.
    expect(stdout).toContain('available')
    expect(stdout).toContain('2.1.0')
  })

  it('set → says so when the saved status carries no version', async () => {
    apiMock.put.mockResolvedValue(envelope({platform_code: 'web', status: {code: 'available'}, release_missing: true}))
    const {stdout} = await runCaptured(MatrixCellsSet, [GID, 'Auth/2FA', 'web', '--status', 'available'])
    expect(stdout).toContain('no version set')
  })

  it('set → without --release the version is left untouched', async () => {
    apiMock.put.mockResolvedValue(envelope({feature_id: 'ft-1'}))
    await runCaptured(MatrixCellsSet, [GID, 'Auth/2FA', 'ios', '--status', 'planned'])
    expect(apiMock.put).toHaveBeenCalledWith(
      `/cli/v1/product/matrix/${GID}/features/Auth%2F2FA/cells/ios`,
      {status: 'planned'},
    )
  })

  it('clear → refuses without --confirm', async () => {
    const {message} = await runExpectingExit(MatrixCellsClear, [GID, 'Auth/2FA', 'web'], 2)
    expect(message).toContain('Refusing to clear')
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('clear → deletes with --confirm', async () => {
    apiMock.delete.mockResolvedValue(envelope({}))
    await runCaptured(MatrixCellsClear, [GID, 'Auth/2FA', 'web', '--confirm'])
    expect(apiMock.delete).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features/Auth%2F2FA/cells/web`)
  })
})

describe('matrix — full flag coverage', () => {
  it('categories update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({name: 'Access'}))
    await runCaptured(MatrixCategoriesUpdate, [GID, 'Auth', '--name', 'Access', '--position', '3'])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/categories/Auth`, {
      name: 'Access', position: 3,
    })
  })

  it('features update maps every optional flag (all set)', async () => {
    apiMock.put.mockResolvedValue(envelope({name: 'Two-factor'}))
    await runCaptured(MatrixFeaturesUpdate, [
      GID, 'ft-1', '--name', 'Two-factor', '--description', 'Second factor',
      '--position', '2', '--category', 'Auth', '--knowledge-page', 'page-1',
    ])
    expect(apiMock.put).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features/ft-1`, {
      name: 'Two-factor', description: 'Second factor', position: 2, category: 'Auth', knowledge_page_id: 'page-1',
    })
  })

  it('features create sends only name and category when nothing else is passed', async () => {
    apiMock.post.mockResolvedValue(envelope({name: '2FA'}))
    await runCaptured(MatrixFeaturesCreate, [GID, '--category', 'Auth', '--name', '2FA'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/features`, {
      category: 'Auth', name: '2FA',
    })
  })

  it('categories create sends only the name when no position is passed', async () => {
    apiMock.post.mockResolvedValue(envelope({name: 'Auth'}))
    await runCaptured(MatrixCategoriesCreate, [GID, '--name', 'Auth'])
    expect(apiMock.post).toHaveBeenCalledWith(`/cli/v1/product/matrix/${GID}/categories`, {name: 'Auth'})
  })
})

/**
 * The backend omits blank optional fields (a description, a version, a whole empty envelope), so
 * every renderer has to survive a payload with holes: without these the "missing value" branches
 * would only ever run against a real server.
 */
describe('matrix — payloads with holes', () => {
  it('list renders rows with missing fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(MatrixList, [])
    expect(stdout).toContain('NAME')
  })

  it('statuses renders rows with missing fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(MatrixStatuses, [])
    expect(stdout).toContain('CODE')
  })

  it('categories list renders rows with missing fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(MatrixCategoriesList, [GID])
    expect(stdout).toContain('NAME')
  })

  it('features list renders rows with missing fields', async () => {
    apiMock.get.mockResolvedValue(envelope([{}]))
    const {stdout} = await runCaptured(MatrixFeaturesList, [GID])
    expect(stdout).toContain('REFERENCE')
  })

  it('show warns when the product has no platforms at all', async () => {
    apiMock.get.mockResolvedValue(envelope({}))
    const {stdout} = await runCaptured(MatrixShow, [GID])
    expect(stdout).toContain('No platforms yet')
    expect(stdout).toContain('No features yet')
  })

  it('show renders a status with no version as bare code', async () => {
    apiMock.get.mockResolvedValue(
      envelope({
        ...MATRIX,
        cells: [{feature_id: 'ft-1', platform_id: 'pf-web', status: {code: 'planned'}, release_missing: false}],
      }),
    )
    const {stdout} = await runCaptured(MatrixShow, [GID])
    expect(stdout).toContain('planned')
  })

  it('show tolerates a category with no features and a feature with no name', async () => {
    apiMock.get.mockResolvedValue(
      envelope({...MATRIX, categories: [{id: 'c1'}, {id: 'c2', features: [{id: 'ft-9'}]}], cells: []}),
    )
    const {stdout} = await runCaptured(MatrixShow, [GID])
    expect(stdout).toContain('FEATURE')
  })

  it('features show renders a feature without cells', async () => {
    apiMock.get.mockResolvedValue(envelope({id: 'ft-1', name: '2FA'}))
    const {stdout} = await runCaptured(MatrixFeaturesShow, [GID, 'ft-1'])
    expect(stdout).toContain('2FA')
  })

  it('features show marks a released cell with no version', async () => {
    apiMock.get.mockResolvedValue(
      envelope({id: 'ft-1', cells: [{platform_id: 'pf-web', release_missing: true}, {platform_id: 'pf-ios'}]}),
    )
    const {stdout} = await runCaptured(MatrixFeaturesShow, [GID, 'ft-1'])
    expect(stdout).toContain('?')
    expect(stdout).toContain('-')
  })

  it('cells set and creates survive an empty envelope', async () => {
    apiMock.put.mockResolvedValue(envelope(undefined))
    await runCaptured(MatrixCellsSet, [GID, 'ft-1', 'web', '--status', 'planned'])
    apiMock.post.mockResolvedValue(envelope(undefined))
    await runCaptured(MatrixCategoriesCreate, [GID, '--name', 'Auth'])
    await runCaptured(MatrixFeaturesCreate, [GID, '--category', 'Auth', '--name', '2FA'])
    apiMock.put.mockResolvedValue(envelope(undefined))
    await runCaptured(MatrixCategoriesUpdate, [GID, 'Auth', '--name', 'Access'])
    await runCaptured(MatrixFeaturesUpdate, [GID, 'ft-1', '--name', 'X'])
    expect(apiMock.put).toHaveBeenCalled()
  })
})
