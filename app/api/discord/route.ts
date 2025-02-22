import { ethers } from "ethers"
import { NextResponse } from "next/server"

// Constants remain the same
const TOKEN_ADDRESS = "0xB770074eA2A8325440798fDF1c29B235b31922Ae"
const ROUTER_ADDRESS = "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae"
const WCRO = "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"
const USDC = "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59"

const ROUTER_ABI = ["function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"]
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"]

export const dynamic = "force-dynamic"

function formatSmallNumber(bigNumberStr: string): string {
  // Remove any scientific notation and ensure we have a decimal string
  const plainNumber = bigNumberStr.includes("e-") ? Number(bigNumberStr).toFixed(20) : bigNumberStr

  // Split into whole and decimal parts
  const [whole, decimal = ""] = plainNumber.split(".")

  if (!decimal) return whole

  // Count leading zeros
  let leadingZeros = 0
  for (let i = 0; i < decimal.length; i++) {
    if (decimal[i] === "0") {
      leadingZeros++
    } else {
      break
    }
  }

  // Get the first significant digit and exactly 3 digits after it
  const significantDigits = decimal.slice(leadingZeros)
  const firstDigit = significantDigits[0] || "0"
  const extraDigits = significantDigits.slice(1, 4).padEnd(3, "0")

  // Return formatted string with exactly 3 decimal places after first significant digit
  return `0.(${leadingZeros})${firstDigit}${extraDigits}`
}

export async function GET() {
  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    return NextResponse.json({ error: "Missing environment variables" }, { status: 500 })
  }

  try {
    const provider = new ethers.JsonRpcProvider("https://evm.cronos.org/")
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider)
    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider)

    const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()])

    const amountIn = ethers.parseUnits("1", decimals)
    const amounts = await router.getAmountsOut(amountIn, [TOKEN_ADDRESS, WCRO, USDC])

    // Get the exact string representation without any rounding
    const rawPrice = amounts[2].toString()
    const price = ethers.formatUnits(rawPrice, 6)
    const formattedPrice = formatSmallNumber(price)

    // Prepare Discord message with exact price
    const message = {
      content: `
📊 **${symbol} Price Update**
💵 Current Price: $${formattedPrice}
⏰ Updated: ${new Date().toLocaleString()}
🔗 Contract: \`${TOKEN_ADDRESS}\`
      `,
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error("Discord API Response:", errorData)
      throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return NextResponse.json({
      success: true,
      message: "Price update sent successfully",
      price: formattedPrice,
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

