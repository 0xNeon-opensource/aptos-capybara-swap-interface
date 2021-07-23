import { AddressZero } from '@ethersproject/constants'
import { useSingleCallResult, useSingleContractMultipleData, Result } from 'state/multicall/hooks'
import { useMemo } from 'react'
import { PositionDetails } from 'types/position'
import { Incentive, useAllIncentives } from './incentives/useAllIncentives'
import { DepositedTokenIdsState, useDepositedTokenIds } from './incentives/useDepositedTokenIds'
import { useV3NFTPositionManagerContract, useV3Staker } from './useContract'
import { BigNumber } from '@ethersproject/bignumber'
import { Pool } from '@uniswap/v3-sdk'
import { Token } from '@uniswap/sdk-core'

interface UseV3PositionsResults {
  loading: boolean
  error: boolean
  positions: PositionDetails[] | undefined
}

function toPoolKey(pool: Pool | { token0: string | Token; token1: string | Token; fee: number }): string {
  return `${typeof pool.token0 === 'string' ? pool.token0 : pool.token0.address}-${
    typeof pool.token1 === 'string' ? pool.token1 : pool.token1.address
  }-${pool.fee}`
}

function useV3PositionsFromTokenIds(tokenIds: BigNumber[] | undefined): UseV3PositionsResults {
  const positionManager = useV3NFTPositionManagerContract()
  const staker = useV3Staker()
  const inputs = useMemo(() => (tokenIds ? tokenIds.map((tokenId) => [tokenId]) : []), [tokenIds])
  const positionInfos = useSingleContractMultipleData(positionManager, 'positions', inputs)
  const tokenIdOwners = useSingleContractMultipleData(positionManager, 'ownerOf', inputs)
  const depositOwners = useSingleContractMultipleData(staker, 'deposits', inputs)
  const { incentives, loading: incentivesLoading } = useAllIncentives()

  const [loading, error] = useMemo(() => {
    const states = [positionInfos, tokenIdOwners, depositOwners]
    return [
      incentivesLoading || states.some((calls) => calls.some(({ loading }) => loading)),
      states.some((calls) => calls.some(({ error }) => error)),
    ]
  }, [depositOwners, incentivesLoading, positionInfos, tokenIdOwners])

  const incentivesByPoolKey = useMemo(() => {
    return (
      incentives?.reduce<{ [poolKey: string]: Incentive[] }>((memo, incentive) => {
        const key = toPoolKey(incentive.pool)
        memo[key] = memo[key] ?? []
        memo[key].push(incentive)
        return memo
      }, {}) ?? {}
    )
  }, [incentives])

  const positions = useMemo(() => {
    if (!loading && !error && tokenIds) {
      return tokenIds
        .map((tokenId, i): PositionDetails | null => {
          const owner = tokenIdOwners[i].result?.[0]
          const positionInfo = positionInfos[i].result
          const depositOwner = depositOwners[i].result?.[0]

          if (!owner || !positionInfo) return null
          const depositedInStaker = Boolean(depositOwner && depositOwner !== AddressZero)
          const poolKey = {
            token0: positionInfo.token0,
            token1: positionInfo.token1,
            fee: positionInfo.fee,
          }
          return {
            ...poolKey,
            tokenId,
            owner: depositedInStaker ? depositOwner : owner,
            depositedInStaker,
            feeGrowthInside0LastX128: positionInfo.feeGrowthInside0LastX128,
            feeGrowthInside1LastX128: positionInfo.feeGrowthInside1LastX128,
            liquidity: positionInfo.liquidity,
            nonce: positionInfo.nonce,
            operator: positionInfo.operator,
            tickLower: positionInfo.tickLower,
            tickUpper: positionInfo.tickUpper,
            tokensOwed0: positionInfo.tokensOwed0,
            tokensOwed1: positionInfo.tokensOwed1,
            incentives: incentivesByPoolKey[toPoolKey(poolKey)] ?? [],
          }
        })
        .filter((p): p is PositionDetails => Boolean(p))
    }
    return undefined
  }, [loading, error, tokenIds, tokenIdOwners, positionInfos, depositOwners, incentivesByPoolKey])

  return {
    loading,
    error,
    positions,
  }
}

interface UseV3PositionResults {
  loading: boolean
  position: PositionDetails | undefined
}

export function useV3PositionFromTokenId(tokenId: BigNumber | undefined): UseV3PositionResults {
  const position = useV3PositionsFromTokenIds(tokenId ? [tokenId] : undefined)
  return {
    loading: position.loading,
    position: position.positions?.[0],
  }
}

export function useV3Positions(account: string | null | undefined): UseV3PositionsResults {
  const positionManager = useV3NFTPositionManagerContract()

  const { loading: balanceLoading, result: balanceResult } = useSingleCallResult(positionManager, 'balanceOf', [
    account ?? undefined,
  ])

  // we don't expect any account balance to ever exceed the bounds of max safe int
  const accountBalance: number | undefined = balanceResult?.[0]?.toNumber()

  const tokenIdsArgs = useMemo(() => {
    if (accountBalance && account) {
      const tokenRequests = []
      for (let i = 0; i < accountBalance; i++) {
        tokenRequests.push([account, i])
      }
      return tokenRequests
    }
    return []
  }, [account, accountBalance])

  const { state: depositedTokenIdsState, tokenIds: depositedTokenIds } = useDepositedTokenIds(account)

  const tokenIdResults = useSingleContractMultipleData(positionManager, 'tokenOfOwnerByIndex', tokenIdsArgs)
  const someTokenIdsLoading = useMemo(
    () => depositedTokenIdsState === DepositedTokenIdsState.LOADING || tokenIdResults.some(({ loading }) => loading),
    [depositedTokenIdsState, tokenIdResults]
  )

  const tokenIds = useMemo(() => {
    if (account) {
      return tokenIdResults
        .map(({ result }) => result)
        .filter((result): result is Result => !!result)
        .map((result) => BigNumber.from(result[0]))
        .concat(depositedTokenIds?.map((id) => BigNumber.from(id.toString())) ?? [])
    }
    return []
  }, [account, depositedTokenIds, tokenIdResults])

  const { positions, loading: positionsLoading, error: positionsError } = useV3PositionsFromTokenIds(tokenIds)

  return {
    loading: someTokenIdsLoading || balanceLoading || positionsLoading,
    error: positionsError,
    positions,
  }
}

interface PositionsForPoolResults {
  loading: boolean
  inRangePositions: PositionDetails[] | undefined
  outOfRangePositions: PositionDetails[] | undefined
}

/**
 * Return the positions within certain pool
 * Useful for returning positions related to a specific LM program
 * @param account
 * @param pool
 */
export function useV3PositionsForPool(
  account: string | null | undefined,
  pool: Pool | undefined
): PositionsForPoolResults {
  const { positions, loading: positionsLoading } = useV3Positions(account)

  if (!positions || !pool || !positionsLoading) {
    return {
      loading: false,
      inRangePositions: undefined,
      outOfRangePositions: undefined,
    }
  }

  const relevantPositions = positions.filter((p) =>
    Boolean(p.token0 === pool.token0.address && p.token1 == pool.token1.address && p.fee === pool.fee)
  )

  const inRangePositions = relevantPositions.filter((p) => {
    // check if price is within range
    const below = typeof p.tickLower === 'number' ? pool.tickCurrent < p.tickLower : undefined
    const above = typeof p.tickUpper === 'number' ? pool.tickCurrent >= p.tickUpper : undefined
    return typeof below === 'boolean' && typeof above === 'boolean' ? !below && !above : false
  })

  const outOfRangePositions = relevantPositions.filter((p) => {
    // check if price is within range
    const below = typeof p.tickLower === 'number' ? pool.tickCurrent < p.tickLower : undefined
    const above = typeof p.tickUpper === 'number' ? pool.tickCurrent >= p.tickUpper : undefined
    return !Boolean(typeof below === 'boolean' && typeof above === 'boolean' ? !below && !above : false)
  })

  return {
    loading: false,
    inRangePositions,
    outOfRangePositions,
  }
}
